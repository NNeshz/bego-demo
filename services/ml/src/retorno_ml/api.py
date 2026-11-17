"""
HTTP API consumed by the web app.

  GET  /health                  service + model status
  GET  /weights?truck_id=…      weights to rank with (personal if known, else global)
  GET  /model                   latest model report (published or not) for the /modelo page
  POST /train                   retrain from logged decisions (Authorization: Bearer ML_ADMIN_TOKEN)
"""

from __future__ import annotations

import hmac
import time
from collections.abc import Callable
from typing import Annotated, Any

from fastapi import FastAPI, Header, HTTPException, Query

from .config import get_settings
from .data import ModelRecord, Repository
from .postgres import PostgresRepository
from .train import InsufficientDataError, train

ACTIVE_MODEL_TTL_S = 30.0
"""The web app calls /weights on every recommendation request: keep the active model in memory."""


def _summary(model: ModelRecord) -> dict[str, Any]:
    metrics = model.metrics
    personas: dict[str, Any] = metrics.get("by_persona", {})
    return {
        "version": model.id,
        "trainedAt": model.created_at.isoformat(),
        "trainedOn": model.trained_on,
        "published": model.published,
        "weights": model.weights,
        "truckers": len(model.truck_weights),
        "metrics": metrics,
        # One representative trucker per simulated persona: the one with personal weights
        # and the most history. Lets the UI show personalization without accounts.
        "demoTruckers": _demo_truckers(model, list(personas)),
    }


def _demo_truckers(model: ModelRecord, personas: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    by_persona: dict[str, Any] = model.metrics.get("by_persona", {})
    history: dict[str, int] = model.metrics.get("personalization", {}).get("decisions_by_trucker", {})
    for persona in personas:
        candidates = [t for t in model.truck_weights if t.startswith(f"sim-{persona}-")]
        if candidates:
            # Most history = most reliable personal weights (never "the one that looks best").
            truck_id = max(sorted(candidates), key=lambda t: history.get(t, 0))
            out.append(
                {
                    "truckId": truck_id,
                    "persona": persona,
                    "description": by_persona.get(persona, {}).get("description"),
                    "weights": model.truck_weights[truck_id],
                }
            )
    return out


def create_app(repo_factory: Callable[[], Repository | None], admin_token: str | None) -> FastAPI:
    app = FastAPI(title="Retorno ML", version="0.1.0")
    cache: dict[str, tuple[float, ModelRecord | None]] = {}

    def repo() -> Repository:
        instance = repo_factory()
        if instance is None:
            raise HTTPException(503, "DATABASE_URL is not configured")
        return instance

    def active_model() -> ModelRecord | None:
        hit = cache.get("active")
        if hit and time.monotonic() - hit[0] < ACTIVE_MODEL_TTL_S:
            return hit[1]
        model = repo().active_model()
        cache["active"] = (time.monotonic(), model)
        return model

    @app.get("/health")
    def health() -> dict[str, Any]:
        try:
            model = active_model()
            return {"status": "ok", "database": True, "model": model and {"version": model.id}}
        except HTTPException:
            return {"status": "ok", "database": False, "model": None}

    @app.get("/weights")
    def weights(truck_id: Annotated[str | None, Query(max_length=64)] = None) -> dict[str, Any]:
        model = active_model()
        if model is None:
            raise HTTPException(404, "No published model yet")
        chosen, scope = model.weights_for(truck_id)
        return {"version": model.id, "scope": scope, "weights": chosen, "trainedAt": model.created_at.isoformat()}

    @app.get("/model")
    def model_report() -> dict[str, Any]:
        latest = repo().latest_model()
        if latest is None:
            raise HTTPException(404, "No model trained yet")
        return _summary(latest)

    @app.post("/train")
    def retrain(authorization: Annotated[str | None, Header()] = None) -> dict[str, Any]:
        if not admin_token:
            raise HTTPException(503, "Training over HTTP is disabled (set ML_ADMIN_TOKEN)")
        supplied = (authorization or "").removeprefix("Bearer ").strip()
        # Constant-time comparison: don't leak the token through response timing.
        if not hmac.compare_digest(supplied.encode(), admin_token.encode()):
            raise HTTPException(401, "Invalid admin token")
        try:
            model = train(repo())
        except InsufficientDataError as error:
            raise HTTPException(422, str(error)) from error
        cache.clear()
        return _summary(model)

    return app


def _default_repo_factory() -> Callable[[], Repository | None]:
    settings = get_settings()
    instance = PostgresRepository(settings.database_url) if settings.database_url else None
    return lambda: instance


app = create_app(_default_repo_factory(), get_settings().admin_token)
