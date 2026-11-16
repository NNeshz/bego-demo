"""Training pipeline: decisions → fit → weights in MXN → offline evaluation → model registry."""

from __future__ import annotations

from typing import Any

from .data import Decision, ModelRecord, Repository
from .evaluate import by_shown_order, by_weights, log_loss, ranking_metrics, split
from .model import COLUMNS, DEFAULT_WEIGHTS, coefficients_to_weights, design_matrix, fit_logistic, score
from .simulator import PERSONAS_BY_NAME

MIN_DECISIONS_WITH_CHOICE = 50


class InsufficientDataError(ValueError):
    pass


def _fit_weights(decisions: list[Decision], l2: float) -> tuple[dict[str, float], list[str], Any]:
    x, y = design_matrix(decisions)
    fit = fit_logistic(x, y, l2=l2)
    weights, clamped = coefficients_to_weights(fit.coef)
    return weights, clamped, fit


def _true_ranker(decision: Decision) -> list[Any]:
    persona = PERSONAS_BY_NAME[decision.persona] if decision.persona else None
    assert persona is not None
    return sorted(decision.options, key=lambda o: (-score(o.features, persona.weights), o.rank))


def train(
    repo: Repository, sources: list[str] | None = None, l2: float = 1.0, save: bool = True
) -> ModelRecord:
    decisions = repo.load_decisions(sources)
    with_choice = sum(d.chosen is not None for d in decisions)
    if with_choice < MIN_DECISIONS_WITH_CHOICE:
        raise InsufficientDataError(
            f"Need at least {MIN_DECISIONS_WITH_CHOICE} decisions with a choice, have {with_choice}. "
            "Run the simulator or collect more feedback."
        )

    train_set, test_set = split(decisions)
    weights, clamped, fit = _fit_weights(train_set, l2)

    metrics: dict[str, Any] = {
        "decisions": {
            "total": len(decisions),
            "train": len(train_set),
            "test": len(test_set),
            "with_choice": with_choice,
        },
        "fit": {
            "iterations": fit.iterations,
            "converged": fit.converged,
            "l2": l2,
            "position_coefficient": float(fit.coef[COLUMNS.index("rank")]),
            "test_log_loss": log_loss(fit, test_set),
        },
        "clamped": clamped,
        "ranking": {
            "shown_order": ranking_metrics(test_set, by_shown_order),
            "default_weights": ranking_metrics(test_set, by_weights(DEFAULT_WEIGHTS)),
            "learned_weights": ranking_metrics(test_set, by_weights(weights)),
        },
    }

    # Simulated data knows the truth: report the ceiling and per-persona recovery.
    if test_set and all(d.persona in PERSONAS_BY_NAME for d in decisions):
        metrics["ranking"]["true_preferences"] = ranking_metrics(test_set, _true_ranker)
        metrics["by_persona"] = {}
        for name, persona in PERSONAS_BY_NAME.items():
            subset_train = [d for d in train_set if d.persona == name]
            subset_test = [d for d in test_set if d.persona == name]
            entry: dict[str, Any] = {
                "description": persona.description,
                "true": persona.weights,
                "decisions": len(subset_train),
            }
            try:
                persona_weights, persona_clamped, _ = _fit_weights(subset_train, l2)
                entry["learned"] = persona_weights
                entry["clamped"] = persona_clamped
                entry["ranking"] = {
                    "default_weights": ranking_metrics(subset_test, by_weights(DEFAULT_WEIGHTS)),
                    "global_learned": ranking_metrics(subset_test, by_weights(weights)),
                    "persona_learned": ranking_metrics(subset_test, by_weights(persona_weights)),
                }
            except (ValueError, ZeroDivisionError) as error:
                entry["error"] = str(error)
            metrics["by_persona"][name] = entry

    coefficients = {name: float(c) for name, c in zip(COLUMNS, fit.coef, strict=True)} | {
        "intercept": fit.intercept
    }
    record = ModelRecord(
        weights=weights, coefficients=coefficients, metrics=metrics, trained_on=len(train_set)
    )
    return repo.save_model(record) if save else record
