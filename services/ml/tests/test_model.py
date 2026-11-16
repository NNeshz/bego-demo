import numpy as np
import pytest
from sklearn.linear_model import LogisticRegression

from retorno_ml.model import (
    DEFAULT_WEIGHTS,
    InvalidModelError,
    coefficients_to_weights,
    fit_logistic,
    score,
)


def make_data(seed: int = 0, n: int = 4000) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    rng = np.random.default_rng(seed)
    # Columns with very different scales, like the real features (MXN/h vs km/h).
    x = np.column_stack(
        [rng.normal(400, 150, n), rng.normal(200, 120, n), rng.exponential(8, n), rng.exponential(0.2, n)]
    )
    true_coef = np.array([0.01, 0.02, -0.05, -2.0])
    true_intercept = -4.0
    y = (rng.random(n) < 1 / (1 + np.exp(-(true_intercept + x @ true_coef)))).astype(float)
    return x, y, true_coef, true_intercept


def test_recovers_known_coefficients() -> None:
    x, y, true_coef, true_intercept = make_data()
    fit = fit_logistic(x, y, l2=1e-6)
    assert fit.converged
    assert fit.iterations < 15  # Newton converges fast
    np.testing.assert_allclose(fit.coef, true_coef, rtol=0.2)
    assert fit.intercept == pytest.approx(true_intercept, rel=0.2)


@pytest.mark.parametrize("l2", [1e-4, 1.0, 25.0])
def test_matches_scikit_learn(l2: float) -> None:
    """Same objective as sklearn's L2 logistic regression on standardized features."""
    x, y, *_ = make_data(seed=1, n=1500)
    ours = fit_logistic(x, y, l2=l2)

    mean, std = x.mean(axis=0), x.std(axis=0)
    reference = LogisticRegression(C=1 / l2, tol=1e-12, max_iter=10_000).fit((x - mean) / std, y)
    ref_coef = reference.coef_[0] / std
    ref_intercept = reference.intercept_[0] - np.sum(reference.coef_[0] * mean / std)

    np.testing.assert_allclose(ours.coef, ref_coef, rtol=1e-4, atol=1e-8)
    assert ours.intercept == pytest.approx(ref_intercept, rel=1e-4)


def test_constant_column_does_not_break_the_fit() -> None:
    x, y, *_ = make_data(n=500)
    x[:, 3] = 7.0
    fit = fit_logistic(x, y)
    assert np.all(np.isfinite(fit.coef))
    assert fit.coef[3] == pytest.approx(0.0, abs=1e-9)


def test_coefficients_become_weights_in_mxn() -> None:
    # β = [net, home, deadhead, wait, rank]
    coef = np.array([0.02, 0.05, -0.1, -6.0, -0.3])
    weights, clamped = coefficients_to_weights(coef)
    assert weights == pytest.approx(
        {"home": 2.5, "deadheadPenaltyMxnPerKm": 5.0, "waitPenaltyMxnPerHour": 300.0}
    )
    assert clamped == []


def test_weights_are_clamped_to_api_bounds() -> None:
    weights, clamped = coefficients_to_weights(np.array([0.01, 0.2, 0.01, -50.0, 0.0]))
    assert weights["home"] == 5.0  # 20 → 5
    assert weights["deadheadPenaltyMxnPerKm"] == 0.0  # negative penalty → 0
    assert weights["waitPenaltyMxnPerHour"] == 2000.0  # 5000 → 2000
    assert sorted(clamped) == ["deadheadPenaltyMxnPerKm", "home", "waitPenaltyMxnPerHour"]


def test_rejects_models_where_money_hurts() -> None:
    with pytest.raises(InvalidModelError):
        coefficients_to_weights(np.array([-0.01, 0.0, 0.0, 0.0, 0.0]))


def test_score_matches_the_engine_formula() -> None:
    features = {
        "net_per_hour": 500.0,
        "home_per_hour": 100.0,
        "deadhead_per_hour": 10.0,
        "wait_per_hour": 0.5,
    }
    assert score(features, DEFAULT_WEIGHTS) == 600.0
    weights = {"home": 2.0, "deadheadPenaltyMxnPerKm": 3.0, "waitPenaltyMxnPerHour": 100.0}
    assert score(features, weights) == 500 + 200 - 30 - 50
