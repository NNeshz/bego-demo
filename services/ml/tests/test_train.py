import itertools
from typing import Any

import pytest

from retorno_ml.data import Decision, InMemoryRepository, Option, decisions_from_rows
from retorno_ml.evaluate import by_shown_order, by_weights, ranking_metrics, split
from retorno_ml.simulator import simulate
from retorno_ml.train import InsufficientDataError, should_publish, train


def simulated_decisions(api: Any, n: int, seed: int = 11) -> list[Decision]:
    counter = itertools.count()
    # Deterministic ids: the train/test split hashes them, so random uuids made metrics vary per run.
    simulate(api, decisions=n, seed=seed, new_id=lambda: f"test-{seed}-{next(counter)}")
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
    zero = {"home_per_hour": 0.0, "deadhead_per_hour": 0.0, "wait_per_hour": 0.0}
    options = (Option("A", 1, {"net_per_hour": 100, **zero}), Option("B", 2, {"net_per_hour": 300, **zero}))
    decision = Decision("d1", options, chosen="B")
    assert ranking_metrics([decision], by_shown_order) == {"hit@1": 0.0, "hit@3": 1.0, "mrr": 0.5, "n": 1}
    weights = {"home": 1.0, "deadheadPenaltyMxnPerKm": 0.0, "waitPenaltyMxnPerHour": 0.0}
    assert ranking_metrics([decision], by_weights(weights))["hit@1"] == 1.0


def test_publish_gate() -> None:
    def ranking(learned: float, default: float) -> dict[str, dict[str, float]]:
        return {"personalized": {"mrr": learned}, "default_weights": {"mrr": default}}

    assert should_publish(ranking(0.92, 0.85))
    assert not should_publish(ranking(0.85, 0.85))  # a tie isn't worth the risk
    assert not should_publish(ranking(0.80, 0.85))
    assert not should_publish(ranking(float("nan"), 0.85))


def test_refuses_to_train_on_too_little_data(fake_api: Any) -> None:
    with pytest.raises(InsufficientDataError):
        train(InMemoryRepository(simulated_decisions(fake_api, 20)))


@pytest.fixture(scope="module")
def trained() -> tuple[Any, InMemoryRepository]:
    from conftest import FakeEngineApi

    repo = InMemoryRepository(simulated_decisions(FakeEngineApi(), 3000))
    return train(repo), repo


def test_personalized_model_beats_defaults_and_nears_the_ceiling(
    trained: tuple[Any, InMemoryRepository],
) -> None:
    model, repo = trained
    ranking = model.metrics["ranking"]
    assert model.metrics["fit"]["converged"]
    assert model.metrics["fit"]["position_coefficient"] < 0  # learned that people favor the top
    assert ranking["personalized"]["hit@1"] > ranking["default_weights"]["hit@1"] + 0.05
    assert ranking["personalized"]["hit@1"] <= ranking["true_preferences"]["hit@1"] + 0.03
    assert model.published and repo.active_model() is model


def test_recovers_each_persona(trained: tuple[Any, InMemoryRepository]) -> None:
    personas = trained[0].metrics["by_persona"]
    assert personas["espera"]["learned_median"]["waitPenaltyMxnPerHour"] > 300
    assert personas["dinero"]["learned_median"]["waitPenaltyMxnPerHour"] < 150
    assert personas["casa"]["learned_median"]["home"] > 1.5
    assert personas["dinero"]["learned_median"]["home"] < 1.0


def test_serves_personal_weights_and_falls_back_to_global(trained: tuple[Any, InMemoryRepository]) -> None:
    model, _ = trained
    truck_id = next(iter(model.truck_weights))
    assert model.weights_for(truck_id) == (model.truck_weights[truck_id], "trucker")
    assert model.weights_for("someone-new") == (model.weights, "global")
    assert model.weights_for(None) == (model.weights, "global")


def test_unpublished_models_are_never_served() -> None:
    from retorno_ml.data import ModelRecord

    repo = InMemoryRepository()
    good = repo.save_model(ModelRecord(weights={}, coefficients={}, metrics={}, trained_on=1))
    repo.save_model(ModelRecord(weights={}, coefficients={}, metrics={}, trained_on=2, published=False))
    assert repo.active_model() is good
    assert repo.latest_model() is not good
