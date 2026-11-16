"""
Logistic regression, written by hand with numpy (Newton-Raphson / IRLS), and the
conversion of its coefficients into engine weights in MXN.

Why by hand: it's ~40 lines, has no heavy dependency (easy to deploy), and every
step is explainable. tests/test_model.py checks it matches scikit-learn.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from .data import MODEL_FEATURES, Decision

FloatArray = NDArray[np.float64]

# Position in the list is a nuisance variable: people click what's on top. Modelling it
# keeps it from leaking into the preference coefficients. It's never converted to a weight.
POSITION_FEATURE = "rank"
COLUMNS: tuple[str, ...] = (*MODEL_FEATURES, POSITION_FEATURE)

# Same bounds the public API accepts for weight overrides (WeightOverridesSchema).
WEIGHT_BOUNDS = {
    "home": (0.0, 5.0),
    "deadheadPenaltyMxnPerKm": (0.0, 50.0),
    "waitPenaltyMxnPerHour": (0.0, 2000.0),
}


def sigmoid(z: FloatArray) -> FloatArray:
    # Clip to avoid overflow in exp for extreme scores.
    return 1.0 / (1.0 + np.exp(-np.clip(z, -35.0, 35.0)))


@dataclass(frozen=True)
class FitResult:
    intercept: float
    coef: FloatArray
    """In the original (unstandardized) units of each column."""
    iterations: int
    converged: bool


def fit_logistic(
    x: FloatArray, y: FloatArray, l2: float = 1.0, max_iter: int = 100, tol: float = 1e-10
) -> FitResult:
    """
    Minimize  Σ logloss(y, σ(b + x·w)) + (l2/2)·‖w‖²   (intercept b not penalized).

    Features are standardized first (Newton converges in a handful of steps and the
    penalty treats every column equally), then coefficients are mapped back.
    Equivalent to sklearn LogisticRegression(C=1/l2) when fitting on standardized x.
    """
    mean = x.mean(axis=0)
    std = x.std(axis=0)
    std[std == 0] = 1.0
    z = (x - mean) / std
    n, d = z.shape
    design = np.hstack([np.ones((n, 1)), z])
    penalty = np.full(d + 1, l2)
    penalty[0] = 0.0

    w = np.zeros(d + 1)
    converged = False
    iterations = 0
    while iterations < max_iter:
        iterations += 1
        p = sigmoid(design @ w)
        gradient = design.T @ (p - y) + penalty * w
        curvature = p * (1.0 - p)
        hessian = design.T @ (design * curvature[:, None]) + np.diag(penalty)
        step = np.linalg.solve(hessian, gradient)
        w -= step
        if float(np.max(np.abs(step))) < tol:
            converged = True
            break

    coef = w[1:] / std
    intercept = float(w[0] - np.sum(w[1:] * mean / std))
    return FitResult(intercept=intercept, coef=coef, iterations=iterations, converged=converged)


def design_matrix(decisions: list[Decision]) -> tuple[FloatArray, FloatArray]:
    """One row per shown option: COLUMNS → x, chosen → y."""
    rows: list[list[float]] = []
    labels: list[float] = []
    for decision in decisions:
        for option in decision.options:
            rows.append([option.features[f] for f in MODEL_FEATURES] + [float(option.rank)])
            labels.append(1.0 if option.load_key == decision.chosen else 0.0)
    return np.asarray(rows, dtype=np.float64), np.asarray(labels, dtype=np.float64)


class InvalidModelError(ValueError):
    """The fit doesn't make economic sense (e.g. more money makes acceptance LESS likely)."""


def coefficients_to_weights(coef: FloatArray) -> tuple[dict[str, float], list[str]]:
    """
    The engine's score is linear in the same features with the money coefficient
    fixed to 1, so dividing by β_net puts every preference in MXN:

      home                     = β_home / β_net
      deadheadPenaltyMxnPerKm  = −β_deadhead / β_net
      waitPenaltyMxnPerHour    = −β_wait / β_net

    Returns the weights (clamped to the API bounds) and the names of clamped ones.
    """
    by_name = dict(zip(COLUMNS, coef.tolist(), strict=True))
    beta_net = by_name["net_per_hour"]
    if beta_net <= 0:
        raise InvalidModelError(f"Money coefficient must be positive, got {beta_net:.4g}")
    raw = {
        "home": by_name["home_per_hour"] / beta_net,
        "deadheadPenaltyMxnPerKm": -by_name["deadhead_per_hour"] / beta_net,
        "waitPenaltyMxnPerHour": -by_name["wait_per_hour"] / beta_net,
    }
    weights: dict[str, float] = {}
    clamped: list[str] = []
    for name, value in raw.items():
        low, high = WEIGHT_BOUNDS[name]
        bounded = min(max(value, low), high)
        if bounded != value:
            clamped.append(name)
        weights[name] = bounded
    return weights, clamped


def score(features: dict[str, float], weights: dict[str, float]) -> float:
    """The engine's ranking score (MXN per hour) for one option. Mirrors packages/engine."""
    return (
        features["net_per_hour"]
        + weights["home"] * features["home_per_hour"]
        - weights["deadheadPenaltyMxnPerKm"] * features["deadhead_per_hour"]
        - weights["waitPenaltyMxnPerHour"] * features["wait_per_hour"]
    )


DEFAULT_WEIGHTS = {"home": 1.0, "deadheadPenaltyMxnPerKm": 0.0, "waitPenaltyMxnPerHour": 0.0}
