"""
retorno-ml simulate --decisions 2000   # synthetic truckers → real API → recommendation_events
retorno-ml train                        # fit, evaluate, save a model version
retorno-ml report                       # print the active model
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from .config import get_settings
from .postgres import PostgresRepository
from .simulator import HttpEngineApi, simulate
from .train import InsufficientDataError, train


def _repo() -> PostgresRepository:
    settings = get_settings()
    if not settings.database_url:
        sys.exit("DATABASE_URL is not set (expected in apps/web/.env.local). The ML service needs Postgres.")
    return PostgresRepository(settings.database_url)


def _print_report(metrics: dict[str, Any], weights: dict[str, float]) -> None:
    print("\nGlobal weights:", json.dumps({k: round(v, 2) for k, v in weights.items()}))
    personalization = metrics.get("personalization", {})
    print(f"Personalized truckers: {personalization.get('truckers')} (shrinkage {personalization.get('shrinkage')})")
    print("\nRanking on held-out decisions (hit@1 / hit@3 / MRR):")
    for name, m in metrics["ranking"].items():
        print(f"  {name:<20} {m['hit@1']:.3f} / {m['hit@3']:.3f} / {m['mrr']:.3f}   (n={m['n']})")
    for name, persona in metrics.get("by_persona", {}).items():
        learned = persona.get("learned_median")
        learned = {k: round(v, 1) for k, v in learned.items()} if learned else None
        hit = {k: round(v["hit@1"], 3) for k, v in persona["ranking"].items()}
        print(f"\n  [{name}] true={persona['true']}\n           learned (median)={learned}\n           hit@1={hit}")
    publish = metrics.get("publish", {})
    print(f"\nPublished: {publish.get('published')} ({publish.get('rule')})")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="retorno-ml")
    sub = parser.add_subparsers(dest="command", required=True)
    sim = sub.add_parser("simulate", help="Synthetic truckers choose among real engine recommendations")
    sim.add_argument("--decisions", type=int, default=2000)
    sim.add_argument("--seed", type=int, default=7)
    sim.add_argument("--api", default=None, help="Engine API base URL (default: RETORNO_API_URL or :3100)")
    tr = sub.add_parser("train", help="Fit and evaluate a model from logged decisions")
    tr.add_argument("--source", action="append", help="Only use events from this source (repeatable)")
    sub.add_parser("report", help="Show the active model")
    args = parser.parse_args(argv)

    if args.command == "simulate":
        api = HttpEngineApi(args.api or get_settings().api_url)
        health = api.health()
        if health.get("dataSource") != "postgres":
            source = health.get("dataSource")
            sys.exit(f"The API at {api.client.base_url} is not using Postgres (dataSource={source}).")
        summary = simulate(api, decisions=args.decisions, seed=args.seed)
        print(json.dumps(summary.__dict__, indent=2))
    elif args.command == "train":
        try:
            model = train(_repo(), sources=args.source)
        except InsufficientDataError as error:
            sys.exit(str(error))
        status = "published" if model.published else "NOT published (did not beat the hand-set weights)"
        print(f"Saved model v{model.id} (trained on {model.trained_on} decisions) · {status}")
        _print_report(model.metrics, model.weights)
    elif args.command == "report":
        model = _repo().active_model()
        if model is None:
            sys.exit("No model trained yet. Run: retorno-ml train")
        print(f"Model v{model.id} · {model.created_at:%Y-%m-%d %H:%M} · trained on {model.trained_on} decisions")
        _print_report(model.metrics, model.weights)


if __name__ == "__main__":
    main()
