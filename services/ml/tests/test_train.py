from typing import Any

import pytest

from retorno_ml.data import Decision, InMemoryRepository, Option, decisions_from_rows
from retorno_ml.evaluate import by_shown_order, by_weights, ranking_metrics, split
from retorno_ml.simulator import PERSONAS_BY_NAME, simulate
from retorno_ml.train import InsufficientDataError, train


def simulated_decisions(api: Any, n: int, seed: int = 11) -> list[Decision]:
    simulate(api, decisions=n, seed=seed)
    rows = [
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
        for batch in api.recorded
        for e in batch
    ]
    return decisions_from_rows(rows)


def test_split_is_by_decision_and_deterministic(fake_api: Any) -> None:
    decisions = simulated_decisions(fake_api, 200)
    train_a, test_a = split(decisions)
    _, test_b = split(decisions)
    assert [d.id for d in test_a] == [d.id for d in test_b]
    assert not {d.id for d in train_a} & {d.id for d in test_a}
    assert 0.15 < len(test_a) / len(decisions) < 0.35


def test_ranking_metrics() -> None:
    options = (
        Option("A", 1, {"net_per_hour": 100, "home_per_hour": 0, "deadhead_per_hour": 0, "wait_per_hour": 0}),
        Option("B", 2, {"net_per_hour": 300, "home_per_hour": 0, "deadhead_per_hour": 0, "wait_per_hour": 0}),
    )
    decision = Decision("d1", options, chosen="B")
    assert ranking_metrics([decision], by_shown_order) == {"hit@1": 0.0, "hit@3": 1.0, "mrr": 0.5, "n": 1}
    weights = {"home": 1.0, "deadheadPenaltyMxnPerKm": 0.0, "waitPenaltyMxnPerHour": 0.0}
    assert ranking_metrics([decision], by_weights(weights))["hit@1"] == 1.0


def test_refuses_to_train_on_too_little_data(fake_api: Any) -> None:
    with pytest.raises(InsufficientDataError):
        train(InMemoryRepository(simulated_decisions(fake_api, 20)))


def test_learned_weights_beat_defaults_and_recover_personas(fake_api: Any) -> None:
    repo = InMemoryRepository(simulated_decisions(fake_api, 3000))
    model = train(repo)
    ranking = model.metrics["ranking"]

    assert model.metrics["fit"]["converged"]
    assert model.metrics["fit"]["position_coefficient"] < 0  # learned that lower rank = less likely
    # Nothing beats knowing the true preferences (small tolerance for sampling noise).
    assert ranking["learned_weights"]["hit@1"] <= ranking["true_preferences"]["hit@1"] + 0.03

    # Per persona: the defining preference is recovered in the right direction and rough size,
    # and persona-specific weights rank better than the hand-set defaults.
    personas = model.metrics["by_persona"]
    for persona in personas.values():
        assert persona["ranking"]["persona_learned"]["hit@1"] > persona["ranking"]["default_weights"]["hit@1"]
    assert personas["espera"]["learned"]["waitPenaltyMxnPerHour"] > 250
    assert personas["dinero"]["learned"]["waitPenaltyMxnPerHour"] < 150
    assert personas["casa"]["learned"]["home"] > 1.5
    assert personas["dinero"]["learned"]["home"] < 1.0
    assert repo.active_model() is model


def test_true_weights_are_the_ones_the_simulator_uses() -> None:
    assert PERSONAS_BY_NAME["espera"].weights["waitPenaltyMxnPerHour"] == 500.0
