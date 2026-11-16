"""Offline evaluation: does ranking with these weights put what truckers actually chose on top?"""

from __future__ import annotations

import hashlib
from collections.abc import Callable

import numpy as np

from .data import Decision, Option
from .model import FitResult, design_matrix, score, sigmoid

Ranker = Callable[[Decision], list[Option]]


def split(
    decisions: list[Decision], test_share: float = 0.25, salt: str = "retorno"
) -> tuple[list[Decision], list[Decision]]:
    """Deterministic split BY DECISION (never by row: options of one screen must stay together)."""

    def bucket(decision: Decision) -> float:
        digest = hashlib.sha256(f"{salt}:{decision.id}".encode()).digest()
        return int.from_bytes(digest[:8], "big") / 2**64

    train = [d for d in decisions if bucket(d) >= test_share]
    test = [d for d in decisions if bucket(d) < test_share]
    return train, test


def by_weights(weights: dict[str, float]) -> Ranker:
    # Ties broken by the shown position, like a stable sort on screen.
    return lambda d: sorted(d.options, key=lambda o: (-score(o.features, weights), o.rank))


def by_shown_order(decision: Decision) -> list[Option]:
    return sorted(decision.options, key=lambda o: o.rank)


def ranking_metrics(decisions: list[Decision], ranker: Ranker) -> dict[str, float]:
    """hit@k: share of decisions whose chosen option lands in the top k. MRR: mean of 1/position."""
    chosen = [d for d in decisions if d.chosen is not None]
    if not chosen:
        return {"hit@1": float("nan"), "hit@3": float("nan"), "mrr": float("nan"), "n": 0}
    positions: list[int] = []
    for decision in chosen:
        ordered = [o.load_key for o in ranker(decision)]
        assert decision.chosen is not None
        positions.append(ordered.index(decision.chosen) + 1)
    pos = np.asarray(positions, dtype=np.float64)
    return {
        "hit@1": float(np.mean(pos <= 1)),
        "hit@3": float(np.mean(pos <= 3)),
        "mrr": float(np.mean(1.0 / pos)),
        "n": len(chosen),
    }


def log_loss(fit: FitResult, decisions: list[Decision]) -> float:
    x, y = design_matrix(decisions)
    p = np.clip(sigmoid(fit.intercept + x @ fit.coef), 1e-12, 1 - 1e-12)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))
