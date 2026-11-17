import numpy as np
import pytest
from sklearn.linear_model import LogisticRegression

from retorno_ml.choice import (
    CHOICE_COLUMNS,
    build_choice_data,
    choice_probabilities,
    column_scale,
    fit_choice,
)
from retorno_ml.data import MODEL_FEATURES, Decision, Option

# net, home, deadhead, wait, rank, outside. Typical option utility is ~11.5, so "home" (12)
# competes for real; with a much lower value it would almost never be chosen and its
# coefficient would be unidentifiable.
TRUE = np.array([0.02, 0.03, -0.15, -6.0, -0.25, 12.0])


def simulate_choices(n: int, seed: int, options_per_screen: int = 5, coef: np.ndarray = TRUE) -> list[Decision]:
    """Decisions drawn from the exact conditional-logit process."""
    rng = np.random.default_rng(seed)
    decisions: list[Decision] = []
    for i in range(n):
        options = tuple(
            Option(
                load_key=f"{i}-{j}",
                rank=j + 1,
                features={
                    "net_per_hour": float(rng.normal(400, 150)),
                    "home_per_hour": float(rng.normal(200, 120)),
                    "deadhead_per_hour": float(rng.exponential(6)),
                    "wait_per_hour": float(rng.exponential(0.15)),
                },
            )
            for j in range(options_per_screen)
        )
        utilities = [coef[:4] @ [o.features[f] for f in MODEL_FEATURES] + coef[4] * o.rank for o in options]
        utilities.append(coef[5])  # drive home empty
        pick = int(np.argmax(np.array(utilities) + rng.gumbel(size=len(utilities))))
        decisions.append(
            Decision(id=str(i), options=options, chosen=options[pick].load_key if pick < len(options) else None)
        )
    return decisions


def fit(decisions: list[Decision], l2: float = 1e-6, prior: np.ndarray | None = None):
    data = build_choice_data(decisions)
    return fit_choice(data, column_scale(data), l2=l2, prior=prior)


def test_recovers_the_true_parameters() -> None:
    result = fit(simulate_choices(6000, seed=1))
    assert result.converged and result.iterations < 20
    np.testing.assert_allclose(result.coef, TRUE, rtol=0.15)


def test_weight_ratios_are_recovered_precisely() -> None:
    """What the engine needs are ratios to the money coefficient (MXN units)."""
    coef = fit(simulate_choices(6000, seed=2)).coef
    assert coef[1] / coef[0] == pytest.approx(TRUE[1] / TRUE[0], rel=0.1)  # home weight
    assert coef[3] / coef[0] == pytest.approx(TRUE[3] / TRUE[0], rel=0.15)  # wait penalty


def test_probabilities_sum_to_one_per_screen() -> None:
    data = build_choice_data(simulate_choices(50, seed=3, options_per_screen=4))
    p = choice_probabilities(data, TRUE)
    np.testing.assert_allclose(p.sum(axis=1), 1.0)
    assert np.all(p[~data.mask] == 0)


@pytest.mark.parametrize("l2", [1e-6, 1e-4])
def test_single_option_screens_equal_binary_logistic_regression(l2: float) -> None:
    """
    With one option + 'home', the conditional logit IS logistic regression. rank is always 1, so the
    intercept is β_rank − β_outside. Compared at near-zero l2: sklearn never penalizes its intercept,
    while we penalize both columns that form it, so with a real penalty the objectives differ.
    """
    decisions = simulate_choices(3000, seed=4, options_per_screen=1)
    data = build_choice_data(decisions)
    scale = column_scale(data)
    ours = fit_choice(data, scale, l2=l2)

    x = data.x[:, 0, :4] / scale[:4]
    y = (data.chosen == 0).astype(float)
    reference = LogisticRegression(C=1 / l2, tol=1e-12, max_iter=10_000).fit(x, y)
    np.testing.assert_allclose(ours.coef[:4] * scale[:4], reference.coef_[0], rtol=1e-3)
    intercept = ours.coef[CHOICE_COLUMNS.index("rank")] - ours.coef[CHOICE_COLUMNS.index("outside")]
    assert intercept == pytest.approx(reference.intercept_[0], rel=1e-3)


def test_shrinks_toward_the_prior_with_little_data() -> None:
    prior = TRUE * np.array([1, 0.2, 0.2, 0.2, 1, 1])  # a quite different "global" model
    few = simulate_choices(15, seed=5)
    strong = fit(few, l2=50.0, prior=prior).coef
    weak = fit(few, l2=1e-3, prior=prior).coef
    assert np.linalg.norm(strong - prior) < np.linalg.norm(weak - prior)


def test_moves_away_from_the_prior_with_enough_data() -> None:
    prior = TRUE * np.array([1, 0.2, 0.2, 0.2, 1, 1])
    coef = fit(simulate_choices(4000, seed=6), l2=5.0, prior=prior).coef
    assert coef[3] / coef[0] == pytest.approx(TRUE[3] / TRUE[0], rel=0.2)
