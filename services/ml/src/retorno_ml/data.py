"""Training data: decisions (options shown together + what was chosen) and where they're stored."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

# Must match MODEL_FEATURES in packages/engine/src/features.ts.
MODEL_FEATURES: tuple[str, ...] = ("net_per_hour", "home_per_hour", "deadhead_per_hour", "wait_per_hour")


@dataclass(frozen=True)
class Option:
    load_key: str
    rank: int
    features: dict[str, float]


@dataclass(frozen=True)
class Decision:
    id: str
    options: tuple[Option, ...]
    chosen: str | None
    """load_key of the accepted option, or None if the trucker took none (drove home empty)."""
    truck_id: str | None = None
    source: str | None = None
    policy: str | None = None

    @property
    def persona(self) -> str | None:
        """Simulated truckers are named sim-<persona>-<n>."""
        if self.truck_id and self.truck_id.startswith("sim-"):
            return self.truck_id.split("-")[1]
        return None


@dataclass
class ModelRecord:
    weights: dict[str, float]
    """Global weights: used for truckers without enough history."""
    coefficients: dict[str, float]
    metrics: dict[str, Any]
    trained_on: int
    truck_weights: dict[str, dict[str, float]] = field(default_factory=lambda: dict[str, dict[str, float]]())
    published: bool = True
    """False when the model didn't beat the hand-set weights on held-out data: kept for the record, never served."""
    id: int | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def weights_for(self, truck_id: str | None) -> tuple[dict[str, float], str]:
        """Personal weights if we have them for this trucker, otherwise the global ones."""
        if truck_id and truck_id in self.truck_weights:
            return self.truck_weights[truck_id], "trucker"
        return self.weights, "global"


class Repository(Protocol):
    def load_decisions(self, sources: list[str] | None = None) -> list[Decision]: ...
    def save_model(self, record: ModelRecord) -> ModelRecord: ...
    def active_model(self) -> ModelRecord | None:
        """Latest PUBLISHED model (the one to serve)."""
        ...

    def latest_model(self) -> ModelRecord | None:
        """Latest trained model, published or not (for reports)."""
        ...


def decisions_from_rows(rows: list[dict[str, Any]]) -> list[Decision]:
    """
    Group raw event rows into decisions. Features come from the "shown" rows; accept
    events only provide the label. Decisions whose accepted option wasn't shown are
    dropped (inconsistent data), as are decisions without shown options.
    """
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(str(row["decision_id"]), []).append(row)

    decisions: list[Decision] = []
    for decision_id, events in grouped.items():
        shown = sorted((e for e in events if e["action"] == "shown"), key=lambda e: int(e["rank"]))
        if not shown:
            continue
        options = tuple(
            Option(
                load_key=">".join(e["load_ids"]),
                rank=int(e["rank"]),
                features={k: float(v) for k, v in e["features"].items()},
            )
            for e in shown
        )
        accepted = [e for e in events if e["action"] == "accepted"]
        chosen = ">".join(accepted[-1]["load_ids"]) if accepted else None
        if chosen is not None and chosen not in {o.load_key for o in options}:
            continue
        if any(f not in o.features for o in options for f in MODEL_FEATURES):
            continue
        first = shown[0]
        decisions.append(
            Decision(
                id=decision_id,
                options=options,
                chosen=chosen,
                truck_id=first.get("truck_id"),
                source=first.get("source"),
                policy=first.get("policy"),
            )
        )
    return decisions


class InMemoryRepository:
    """For tests and local experiments."""

    def __init__(self, decisions: list[Decision] | None = None) -> None:
        self.decisions = decisions or []
        self.models: list[ModelRecord] = []

    def load_decisions(self, sources: list[str] | None = None) -> list[Decision]:
        return [d for d in self.decisions if sources is None or d.source in sources]

    def save_model(self, record: ModelRecord) -> ModelRecord:
        record.id = len(self.models) + 1
        self.models.append(record)
        return record

    def active_model(self) -> ModelRecord | None:
        published = [m for m in self.models if m.published]
        return published[-1] if published else None

    def latest_model(self) -> ModelRecord | None:
        return self.models[-1] if self.models else None
