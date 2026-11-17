"""
Training pipeline.

1. Global conditional-logit model on every decision (the prior).
2. Per-trucker models, shrunk toward the global one. The shrinkage strength is picked
   on a VALIDATION split carved out of the training data (the test split is never
   used to choose anything).
3. Offline evaluation on held-out decisions against: the order shown, the hand-set
   weights, the pointwise logistic baseline and (for simulated data) the truth.
4. Publish gate: the model is only served if it ranks better than the hand-set weights.
"""

from __future__ import annotations

from collections import defaultdict
from statistics import median
from typing import Any

import numpy as np
from numpy.typing import NDArray

from .choice import CHOICE_COLUMNS, ChoiceFit, build_choice_data, column_scale, fit_choice
from .data import Decision, ModelRecord, Repository
from .evaluate import Ranker, by_shown_order, by_weights, ranking_metrics, split
from .model import (
    DEFAULT_WEIGHTS,
    InvalidModelError,
    coefficients_to_weights,
    design_matrix,
    fit_logistic,
    score,
)
from .simulator import PERSONAS_BY_NAME

FloatArray = NDArray[np.float64]

MIN_DECISIONS_WITH_CHOICE = 50
MIN_TRUCKER_DECISIONS = 3
GLOBAL_L2 = 1.0
SHRINKAGE_GRID = (0.03, 0.1, 0.3, 1.0, 3.0, 10.0, 30.0, 100.0)
"""Candidate penalties toward the global model. Higher = trust the group more than the individual."""


class InsufficientDataError(ValueError):
    pass


def _by_trucker(decisions: list[Decision]) -> dict[str, list[Decision]]:
    groups: dict[str, list[Decision]] = defaultdict(list)
    for d in decisions:
        if d.truck_id:
            groups[d.truck_id].append(d)
    return groups


def _fit_personal(
    decisions: list[Decision], scale: FloatArray, prior: FloatArray, shrinkage: float
) -> dict[str, dict[str, float]]:
    weights: dict[str, dict[str, float]] = {}
    for truck_id, own in _by_trucker(decisions).items():
        if len(own) < MIN_TRUCKER_DECISIONS:
            continue
        fit = fit_choice(build_choice_data(own), scale, l2=shrinkage, prior=prior)
        try:
            weights[truck_id] = coefficients_to_weights(fit.coef)[0]
        except InvalidModelError:
            continue  # this trucker's data is too odd: they'll get the global weights
    return weights


def personalized_ranker(truck_weights: dict[str, dict[str, float]], global_weights: dict[str, float]) -> Ranker:
    def rank(decision: Decision) -> list[Any]:
        weights = truck_weights.get(decision.truck_id or "", global_weights)
        return by_weights(weights)(decision)

    return rank


def _true_ranker(decision: Decision) -> list[Any]:
    persona = PERSONAS_BY_NAME[decision.persona or ""]
    return sorted(decision.options, key=lambda o: (-score(o.features, persona.weights), o.rank))


def _choose_shrinkage(
    train_set: list[Decision], scale: FloatArray, global_fit: ChoiceFit, global_weights: dict[str, float]
) -> tuple[float, dict[str, float]]:
    """Pick the penalty that ranks best on a validation split (never on the test split)."""
    fit_part, validation = split(train_set, test_share=0.25, salt="validation")
    prior_fit = fit_choice(build_choice_data(fit_part), scale, l2=GLOBAL_L2)
    prior_weights = _safe_weights(prior_fit) or global_weights
    scores: dict[str, float] = {}
    for shrinkage in SHRINKAGE_GRID:
        personal = _fit_personal(fit_part, scale, prior_fit.coef, shrinkage)
        scores[str(shrinkage)] = ranking_metrics(validation, personalized_ranker(personal, prior_weights))["mrr"]
    best = max(SHRINKAGE_GRID, key=lambda s: scores[str(s)])
    return best, scores


def _safe_weights(fit: ChoiceFit) -> dict[str, float] | None:
    try:
        return coefficients_to_weights(fit.coef)[0]
    except InvalidModelError:
        return None


def train(repo: Repository, sources: list[str] | None = None, save: bool = True) -> ModelRecord:
    decisions = repo.load_decisions(sources)
    with_choice = sum(d.chosen is not None for d in decisions)
    if with_choice < MIN_DECISIONS_WITH_CHOICE:
        raise InsufficientDataError(
            f"Need at least {MIN_DECISIONS_WITH_CHOICE} decisions with a choice, have {with_choice}. "
            "Run the simulator or collect more feedback."
        )

    train_set, test_set = split(decisions)
    train_data = build_choice_data(train_set)
    scale = column_scale(train_data)

    global_fit = fit_choice(train_data, scale, l2=GLOBAL_L2)
    global_weights, clamped = coefficients_to_weights(global_fit.coef)  # raises if money hurts
    shrinkage, validation_mrr = _choose_shrinkage(train_set, scale, global_fit, global_weights)
    truck_weights = _fit_personal(train_set, scale, global_fit.coef, shrinkage)

    # Baseline: pointwise logistic regression (each option as an independent yes/no).
    x, y = design_matrix(train_set)
    pointwise = fit_logistic(x, y, l2=GLOBAL_L2)
    try:
        pointwise_weights: dict[str, float] | None = coefficients_to_weights(pointwise.coef)[0]
    except InvalidModelError:
        pointwise_weights = None

    rankers: dict[str, Ranker] = {
        "shown_order": by_shown_order,
        "default_weights": by_weights(DEFAULT_WEIGHTS),
        "global_learned": by_weights(global_weights),
        "personalized": personalized_ranker(truck_weights, global_weights),
    }
    if pointwise_weights is not None:
        rankers["pointwise_baseline"] = by_weights(pointwise_weights)
    simulated = bool(decisions) and all(d.persona in PERSONAS_BY_NAME for d in decisions)
    if simulated:
        rankers["true_preferences"] = _true_ranker

    ranking = {name: ranking_metrics(test_set, ranker) for name, ranker in rankers.items()}
    published = should_publish(ranking)

    metrics: dict[str, Any] = {
        "model": "conditional_logit",
        "decisions": {
            "total": len(decisions),
            "train": len(train_set),
            "test": len(test_set),
            "with_choice": with_choice,
        },
        "fit": {
            "iterations": global_fit.iterations,
            "converged": global_fit.converged,
            "l2": GLOBAL_L2,
            "position_coefficient": float(global_fit.coef[CHOICE_COLUMNS.index("rank")]),
            "outside_coefficient": float(global_fit.coef[CHOICE_COLUMNS.index("outside")]),
            "test_log_likelihood_per_decision": _mean_log_likelihood(test_set, global_fit.coef),
        },
        "personalization": {
            # History behind each personal model (reliability), e.g. to pick demo truckers.
            "decisions_by_trucker": {t: len(own) for t, own in _by_trucker(train_set).items() if t in truck_weights},
            "shrinkage": shrinkage,
            "validation_mrr_by_shrinkage": validation_mrr,
            "truckers": len(truck_weights),
            "min_decisions": MIN_TRUCKER_DECISIONS,
        },
        "pointwise_baseline_weights": pointwise_weights,
        "clamped": clamped,
        "ranking": ranking,
        "publish": {
            "published": published,
            "rule": "personalized MRR > default-weights MRR on held-out decisions",
        },
    }
    if simulated:
        metrics["by_persona"] = _persona_report(test_set, truck_weights, global_weights, rankers)

    coefficients = {name: float(c) for name, c in zip(CHOICE_COLUMNS, global_fit.coef, strict=True)}
    record = ModelRecord(
        weights=global_weights,
        coefficients=coefficients,
        metrics=metrics,
        trained_on=len(train_set),
        truck_weights=truck_weights,
        published=published,
    )
    return repo.save_model(record) if save else record


def should_publish(ranking: dict[str, dict[str, float]]) -> bool:
    """Serve the model only if it ranks better than the hand-set weights on held-out decisions."""
    learned, default = ranking["personalized"]["mrr"], ranking["default_weights"]["mrr"]
    return bool(np.isfinite(learned) and np.isfinite(default) and learned > default)


def _mean_log_likelihood(decisions: list[Decision], coef: FloatArray) -> float:
    if not decisions:
        return float("nan")
    data = build_choice_data(decisions)
    from .choice import choice_probabilities

    p = choice_probabilities(data, coef)[np.arange(len(decisions)), data.chosen]
    return float(np.mean(np.log(np.clip(p, 1e-300, None))))


def _persona_report(
    test_set: list[Decision],
    truck_weights: dict[str, dict[str, float]],
    global_weights: dict[str, float],
    rankers: dict[str, Ranker],
) -> dict[str, Any]:
    report: dict[str, Any] = {}
    for name, persona in PERSONAS_BY_NAME.items():
        own = {t: w for t, w in truck_weights.items() if t.startswith(f"sim-{name}-")}
        typical = {k: float(median(w[k] for w in own.values())) for k in DEFAULT_WEIGHTS} if own else None
        subset = [d for d in test_set if d.persona == name]
        report[name] = {
            "description": persona.description,
            "true": persona.weights,
            "learned_median": typical,
            "truckers": len(own),
            "ranking": {
                k: ranking_metrics(subset, rankers[k])
                for k in ("default_weights", "global_learned", "personalized", "true_preferences")
                if k in rankers
            },
        }
    return report
