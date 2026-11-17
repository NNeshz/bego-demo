"""
Conditional (multinomial) logit: the right model when someone picks ONE option out
of a screen, or none.

Each decision is a set of alternatives: the options shown plus "drive home empty".
  utility(option) = β · [net/h, home/h, deadhead/h, wait/h, rank, 0]
  utility(home)   = β · [0, 0, 0, 0, 0, 1]          (β_outside is learned)
  P(choose a)     = exp(utility a) / Σ exp(utilities on that screen)

Unlike pointwise logistic regression, options compete within their screen, which
is exactly how the simulator (and a real trucker) decides. With a single option per
screen it reduces to binary logistic regression; tests use that to check against
scikit-learn.

Personalization: fitting with an L2 penalty toward a PRIOR (instead of toward zero)
gives empirical-Bayes shrinkage. A trucker with little history stays close to the
global model; as feedback accumulates, their weights move to their own preferences.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from .data import MODEL_FEATURES, Decision

FloatArray = NDArray[np.float64]
BoolArray = NDArray[np.bool_]

CHOICE_COLUMNS: tuple[str, ...] = (*MODEL_FEATURES, "rank", "outside")
N_COLUMNS = len(CHOICE_COLUMNS)


@dataclass(frozen=True)
class ChoiceData:
    """Decisions padded to the same number of alternatives so the math is vectorized."""

    x: FloatArray  # (decisions, alternatives, columns)
    mask: BoolArray  # (decisions, alternatives): real alternative or padding
    chosen: NDArray[np.int64]  # (decisions,): index of the chosen alternative (last real one = home)


def build_choice_data(decisions: list[Decision]) -> ChoiceData:
    width = max((len(d.options) for d in decisions), default=0) + 1
    x = np.zeros((len(decisions), width, N_COLUMNS))
    mask = np.zeros((len(decisions), width), dtype=bool)
    chosen = np.zeros(len(decisions), dtype=np.int64)
    for i, decision in enumerate(decisions):
        for j, option in enumerate(decision.options):
            x[i, j, :-2] = [option.features[f] for f in MODEL_FEATURES]
            x[i, j, -2] = option.rank
        home = len(decision.options)
        x[i, home, -1] = 1.0
        mask[i, : home + 1] = True
        keys = [o.load_key for o in decision.options]
        chosen[i] = keys.index(decision.chosen) if decision.chosen in keys else home
    return ChoiceData(x=x, mask=mask, chosen=chosen)


def column_scale(data: ChoiceData) -> FloatArray:
    """Std of each column over real options (the outside indicator stays unscaled).
    No centering: shifting a column changes every option on a screen equally and cancels out."""
    real = data.mask.copy()
    real[np.arange(len(data.chosen)), data.mask.sum(axis=1) - 1] = False  # exclude the home alternative
    scale = np.ones(N_COLUMNS)
    if real.any():
        values = data.x[real][:, :-1]
        std = values.std(axis=0)
        scale[:-1] = np.where(std > 0, std, 1.0)
    return scale


@dataclass(frozen=True)
class ChoiceFit:
    coef: FloatArray
    """In original units, ordered as CHOICE_COLUMNS."""
    iterations: int
    converged: bool
    log_likelihood: float


def _probabilities(z: FloatArray, mask: BoolArray, theta: FloatArray) -> FloatArray:
    utility: FloatArray = np.einsum("nad,d->na", z, theta)
    utility = np.where(mask, utility, -np.inf)
    utility -= utility.max(axis=1, keepdims=True)  # numerical stability
    expu = np.exp(utility)
    return expu / expu.sum(axis=1, keepdims=True)


def fit_choice(
    data: ChoiceData,
    scale: FloatArray,
    l2: float = 1.0,
    prior: FloatArray | None = None,
    max_iter: int = 100,
    tol: float = 1e-9,
) -> ChoiceFit:
    """
    Minimize  −Σ log P(chosen) + (l2/2)·‖θ − prior‖²  with Newton's method, in scaled units.
    `prior` is in ORIGINAL units (e.g. the global model's coef); default is zero.
    """
    n = len(data.chosen)
    z = data.x / scale
    prior_scaled = np.zeros(N_COLUMNS) if prior is None else prior * scale
    onehot = np.zeros(data.mask.shape)
    onehot[np.arange(n), data.chosen] = 1.0

    rows = np.arange(n)

    def objective(theta: FloatArray) -> float:
        p = _probabilities(z, data.mask, theta)
        nll = -float(np.sum(np.log(np.clip(p[rows, data.chosen], 1e-300, None))))
        return nll + 0.5 * l2 * float(np.sum((theta - prior_scaled) ** 2))

    # Start at zero (all options equally likely): from a prior far from the optimum the
    # softmax can saturate and a full Newton step overshoots. The line search below
    # (damped Newton) guarantees the objective decreases on every iteration.
    theta: FloatArray = np.zeros(N_COLUMNS)
    current = objective(theta)
    converged = False
    iterations = 0
    while iterations < max_iter:
        iterations += 1
        p = _probabilities(z, data.mask, theta)
        # einsum is untyped in numpy's stubs: annotate so strict pyright keeps the float arrays typed.
        gradient: FloatArray = np.einsum("na,nad->d", p - onehot, z) + l2 * (theta - prior_scaled)
        mean_z: FloatArray = np.einsum("na,nad->nd", p, z)
        hessian: FloatArray = (
            np.einsum("na,nad,nae->de", p, z, z) - np.einsum("nd,ne->de", mean_z, mean_z) + l2 * np.eye(N_COLUMNS)
        )
        step: FloatArray = np.linalg.solve(hessian, gradient)
        t = 1.0
        while t > 1e-8 and objective(theta - t * step) > current:
            t *= 0.5
        theta = theta - t * step
        current = objective(theta)
        if float(np.max(np.abs(t * step))) < tol:
            converged = True
            break

    p = _probabilities(z, data.mask, theta)
    log_likelihood = float(np.sum(np.log(np.clip(p[rows, data.chosen], 1e-300, None))))
    return ChoiceFit(coef=theta / scale, iterations=iterations, converged=converged, log_likelihood=log_likelihood)


def choice_probabilities(data: ChoiceData, coef: FloatArray) -> FloatArray:
    return _probabilities(data.x, data.mask, coef)


def preference_coef(coef: FloatArray) -> FloatArray:
    """The four preference coefficients (net, home, deadhead, wait) used to derive engine weights."""
    return coef[: len(MODEL_FEATURES)]
