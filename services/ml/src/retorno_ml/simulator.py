"""
Synthetic truckers with HIDDEN preferences, choosing among options served by the
real engine API. Because we know the true preferences, we can measure whether the
model recovers them — the honest claim is "recovers known preferences", not
"learned real market behavior".

Choice model (multinomial logit, standard in discrete-choice economics):
  utility(option) = score(option, persona weights) / TEMPERATURE − POSITION_BIAS·(rank − 1) + Gumbel noise
  utility(go home empty) = OUTSIDE_SCORE / TEMPERATURE + Gumbel noise
The trucker takes whatever has the highest utility.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

import httpx
import numpy as np

from .model import score

TEMPERATURE = 60.0
"""MXN/h of score difference that moves the odds by e (~2.7×). Larger = noisier truckers."""
POSITION_BIAS = 0.25
"""People favor what's on top. The model must learn to separate this from preference."""
OUTSIDE_SCORE = 150.0
"""Below ~150 MXN/h of value, driving home empty starts to look as good."""
EXPLORE_SHARE = 0.7
"""Share of decisions where the shown list is randomized (see `policy`)."""


@dataclass(frozen=True)
class Persona:
    name: str
    description: str
    share: float
    weights: dict[str, float]


PERSONAS: tuple[Persona, ...] = (
    Persona(
        "casa",
        "Quiere volver a su base: valora mucho cada km que se acerca y odia ir vacío a recoger",
        0.4,
        {"home": 2.5, "deadheadPenaltyMxnPerKm": 6.0, "waitPenaltyMxnPerHour": 60.0},
    ),
    Persona(
        "espera",
        "No soporta esperar en patio: cada hora de espera le pesa como $500",
        0.3,
        {"home": 0.8, "deadheadPenaltyMxnPerKm": 2.0, "waitPenaltyMxnPerHour": 500.0},
    ),
    Persona(
        "dinero",
        "Solo le importa la ganancia por hora",
        0.3,
        {"home": 0.3, "deadheadPenaltyMxnPerKm": 0.5, "waitPenaltyMxnPerHour": 20.0},
    ),
)
PERSONAS_BY_NAME = {p.name: p for p in PERSONAS}

UNIT_MIX = (
    ("dry_van_53", 0.6),
    ("reefer_53", 0.15),
    ("flatbed_48", 0.1),
    ("full_double", 0.1),
    ("torton", 0.05),
)
MX = timedelta(hours=-6)


class EngineApi(Protocol):
    def cities(self) -> list[str]: ...
    def recommendations(self, trip: dict[str, Any], limit: int) -> list[dict[str, Any]]: ...
    def record(self, events: list[dict[str, Any]]) -> None: ...


class HttpEngineApi:
    """The public API v1, exactly as any client would use it."""

    def __init__(self, base_url: str, timeout: float = 15.0) -> None:
        self.client = httpx.Client(base_url=base_url, timeout=timeout)

    def health(self) -> dict[str, Any]:
        response = self.client.get("/api/v1/health")
        response.raise_for_status()
        return response.json()

    def cities(self) -> list[str]:
        response = self.client.get("/api/v1/cities")
        response.raise_for_status()
        return [c["id"] for c in response.json()["cities"]]

    def recommendations(self, trip: dict[str, Any], limit: int) -> list[dict[str, Any]]:
        response = self.client.post("/api/v1/recommendations", json={"truck": trip, "limit": limit})
        response.raise_for_status()
        return response.json()["recommendations"]

    def record(self, events: list[dict[str, Any]]) -> None:
        response = self.client.post("/api/v1/events/batch", json={"events": events})
        response.raise_for_status()


@dataclass
class SimulationSummary:
    decisions: int = 0
    skipped: int = 0
    went_home_empty: int = 0
    by_persona: dict[str, int] = field(default_factory=lambda: dict[str, int]())
    chosen_rank: dict[int, int] = field(default_factory=lambda: dict[int, int]())


def choose(options: list[dict[str, Any]], persona: Persona, rng: np.random.Generator) -> int | None:
    """Index of the chosen option (in display order), or None to drive home empty."""
    utilities = [
        score(o["features"], persona.weights) / TEMPERATURE - POSITION_BIAS * i + rng.gumbel()
        for i, o in enumerate(options)
    ]
    outside = OUTSIDE_SCORE / TEMPERATURE + rng.gumbel()
    best = int(np.argmax(utilities))
    return best if utilities[best] > outside else None


def random_trip(cities: list[str], rng: np.random.Generator, now: datetime) -> dict[str, Any]:
    position, base = rng.choice(len(cities), size=2, replace=False)
    units, shares = zip(*UNIT_MIX, strict=True)
    unit = units[int(rng.choice(len(units), p=np.array(shares)))]
    available = now + timedelta(hours=float(rng.uniform(2, 72)))
    local = (available + MX).replace(tzinfo=None, microsecond=0)
    return {
        "unitType": unit,
        "position": {"cityId": cities[int(position)]},
        "base": {"cityId": cities[int(base)]},
        "availableAt": f"{local.isoformat()}-06:00",
    }


def simulate(
    api: EngineApi,
    decisions: int,
    seed: int = 7,
    explore_share: float = EXPLORE_SHARE,
    now: datetime | None = None,
) -> SimulationSummary:
    rng = np.random.default_rng(seed)
    cities = api.cities()
    now = now or datetime.now(UTC)
    shares = np.array([p.share for p in PERSONAS])
    summary = SimulationSummary()
    attempts = 0

    while summary.decisions < decisions and attempts < decisions * 5:
        attempts += 1
        persona = PERSONAS[int(rng.choice(len(PERSONAS), p=shares / shares.sum()))]
        candidates = api.recommendations(random_trip(cities, rng, now), limit=10)
        if len(candidates) < 2:
            summary.skipped += 1
            continue

        # Exploration: show a random subset in random order, so the data covers options
        # the current engine wouldn't rank first (otherwise the model only sees its own bias).
        explore = rng.random() < explore_share
        if explore:
            picked = rng.choice(len(candidates), size=min(5, len(candidates)), replace=False)
            shown = [candidates[int(i)] for i in picked]
        else:
            shown = candidates[:5]

        chosen = choose(shown, persona, rng)
        decision_id = str(uuid.uuid4())
        truck_id = f"sim-{persona.name}-{int(rng.integers(1, 41))}"
        base_event = {
            "decisionId": decision_id,
            "policy": "explore" if explore else "engine",
            "source": "simulator",
            "truckId": truck_id,
        }
        events = [
            {
                **base_event,
                "action": "shown",
                "loadIds": [o["load"]["id"]],
                "rank": i + 1,
                "scorePerHour": o["scorePerHour"],
                "gainVsEmptyMxn": o["gainVsEmptyMxn"],
                "features": o["features"],
            }
            for i, o in enumerate(shown)
        ]
        if chosen is not None:
            events.append({**events[chosen], "action": "accepted"})
            summary.chosen_rank[chosen + 1] = summary.chosen_rank.get(chosen + 1, 0) + 1
        else:
            summary.went_home_empty += 1
        api.record(events)

        summary.decisions += 1
        summary.by_persona[persona.name] = summary.by_persona.get(persona.name, 0) + 1
    return summary
