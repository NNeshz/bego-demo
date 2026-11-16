from __future__ import annotations

from typing import Any

import numpy as np
import pytest


class FakeEngineApi:
    """Serves random but plausible options; records whatever the simulator sends."""

    def __init__(self, seed: int = 0) -> None:
        self.rng = np.random.default_rng(seed)
        self.recorded: list[list[dict[str, Any]]] = []
        self.counter = 0

    def cities(self) -> list[str]:
        return ["nuevo-laredo", "queretaro", "monterrey", "cdmx"]

    def recommendations(self, trip: dict[str, Any], limit: int) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for _ in range(limit):
            self.counter += 1
            hours = float(self.rng.uniform(8, 40))
            features = {
                "net_per_hour": float(self.rng.normal(400, 150)),
                "home_per_hour": float(self.rng.normal(250, 150)),
                "deadhead_per_hour": float(self.rng.exponential(6)),
                "wait_per_hour": float(self.rng.exponential(0.15)),
                "total_hours": hours,
            }
            out.append(
                {
                    "load": {"id": f"CRG-{self.counter:04d}"},
                    "scorePerHour": features["net_per_hour"] + features["home_per_hour"],
                    "gainVsEmptyMxn": 10_000.0,
                    "features": features,
                }
            )
        return out

    def record(self, events: list[dict[str, Any]]) -> None:
        self.recorded.append(events)


@pytest.fixture
def fake_api() -> FakeEngineApi:
    return FakeEngineApi()


@pytest.fixture
def make_fake_api() -> type[FakeEngineApi]:
    return FakeEngineApi
