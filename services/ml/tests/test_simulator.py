from typing import Any

import numpy as np

from retorno_ml.data import decisions_from_rows
from retorno_ml.simulator import PERSONAS_BY_NAME, choose, simulate


def option(net: float, home: float = 0.0, deadhead: float = 0.0, wait: float = 0.0) -> dict[str, Any]:
    return {
        "features": {
            "net_per_hour": net,
            "home_per_hour": home,
            "deadhead_per_hour": deadhead,
            "wait_per_hour": wait,
        }
    }


def share_chosen(options: list[dict[str, Any]], persona: str, index: int, n: int = 3000) -> float:
    rng = np.random.default_rng(1)
    picks = [choose(options, PERSONAS_BY_NAME[persona], rng) for _ in range(n)]
    return sum(p == index for p in picks) / n


def test_personas_behave_as_described() -> None:
    # Same money; option 1 makes you wait (0.5 h of waiting per hour of trip).
    waiting = [option(500), option(500, wait=0.5)]
    assert share_chosen(waiting, "espera", 1) < 0.05
    assert share_chosen(waiting, "dinero", 1) > 0.25

    # Less money but much closer to home: the "casa" trucker takes it, the "dinero" one doesn't.
    home = [option(520), option(420, home=150)]
    assert share_chosen(home, "casa", 1) > 0.8
    assert share_chosen(home, "dinero", 1) < 0.4


def test_position_bias_favors_the_top() -> None:
    same = [option(500), option(500)]
    assert share_chosen(same, "dinero", 0) > share_chosen(same, "dinero", 1)


def test_bad_options_send_the_trucker_home_empty() -> None:
    rng = np.random.default_rng(0)
    picks = [choose([option(20), option(10)], PERSONAS_BY_NAME["dinero"], rng) for _ in range(500)]
    assert sum(p is None for p in picks) / 500 > 0.8


def test_simulation_logs_decisions_the_trainer_can_read(fake_api: Any) -> None:
    summary = simulate(fake_api, decisions=50, seed=3)
    assert summary.decisions == 50
    assert sum(summary.by_persona.values()) == 50

    rows: list[dict[str, Any]] = []
    for batch in fake_api.recorded:
        shown = [e for e in batch if e["action"] == "shown"]
        assert 2 <= len(shown) <= 5
        assert len({e["decisionId"] for e in batch}) == 1
        assert [e["rank"] for e in shown] == list(range(1, len(shown) + 1))
        rows += [
            {
                "decision_id": e["decisionId"],
                "action": e["action"],
                "rank": e["rank"],
                "load_ids": e["loadIds"],
                "features": e["features"],
                "policy": e["policy"],
                "source": e["source"],
                "truck_id": e["truckId"],
            }
            for e in batch
        ]
    decisions = decisions_from_rows(rows)
    assert len(decisions) == 50
    assert {d.persona for d in decisions} <= {"casa", "espera", "dinero"}
    assert sum(d.chosen is None for d in decisions) == summary.went_home_empty


def test_simulation_is_deterministic(make_fake_api: Any) -> None:
    a, b = make_fake_api(), make_fake_api()
    simulate(a, decisions=20, seed=9)
    simulate(b, decisions=20, seed=9)

    def strip(batches: list[list[dict[str, Any]]]) -> list[list[dict[str, Any]]]:
        """Decision ids are random UUIDs; everything else must be identical."""
        return [[{k: v for k, v in e.items() if k != "decisionId"} for e in batch] for batch in batches]

    assert strip(a.recorded) == strip(b.recorded)
