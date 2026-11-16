"""Postgres repository: reads the same tables the web app writes (recommendation_events, model_versions)."""

from __future__ import annotations

from typing import Any, cast

import psycopg
from psycopg.rows import DictRow, dict_row
from psycopg.types.json import Jsonb

from .data import Decision, ModelRecord, decisions_from_rows


class PostgresRepository:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def _connect(self) -> psycopg.Connection[DictRow]:
        # psycopg's connect() overloads don't narrow row_factory for pyright; the cast states the
        # (correct) runtime type once, so every query below is typed as dict rows.
        connect = cast(Any, psycopg.Connection.connect)
        return cast(
            psycopg.Connection[DictRow], connect(self.database_url, row_factory=dict_row, connect_timeout=5)
        )

    def load_decisions(self, sources: list[str] | None = None) -> list[Decision]:
        query = """
            select decision_id, action, rank, load_ids, features, policy, source, truck_id
            from recommendation_events
            where decision_id is not null
              and (%(sources)s::text[] is null or source = any(%(sources)s::text[]))
            order by created_at, rank
        """
        with self._connect() as conn:
            rows = conn.execute(query, {"sources": sources}).fetchall()
        return decisions_from_rows(rows)

    def save_model(self, record: ModelRecord) -> ModelRecord:
        with self._connect() as conn:
            row = conn.execute(
                """
                insert into model_versions (weights, coefficients, metrics, trained_on, active)
                values (%s, %s, %s, %s, true)
                returning id, created_at
                """,
                (Jsonb(record.weights), Jsonb(record.coefficients), Jsonb(record.metrics), record.trained_on),
            ).fetchone()
        assert row is not None
        record.id = cast(int, row["id"])
        record.created_at = row["created_at"]
        return record

    def active_model(self) -> ModelRecord | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                select id, created_at, weights, coefficients, metrics, trained_on
                from model_versions where active order by id desc limit 1
                """
            ).fetchone()
        if row is None:
            return None
        return ModelRecord(
            id=row["id"],
            created_at=row["created_at"],
            weights=row["weights"],
            coefficients=row["coefficients"],
            metrics=row["metrics"],
            trained_on=row["trained_on"],
        )
