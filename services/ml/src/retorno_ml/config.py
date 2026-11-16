"""Settings from the environment. Shares apps/web/.env.local with the web app (one place for secrets)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

_ENV_FILE = Path(__file__).resolve().parents[4] / "apps" / "web" / ".env.local"


def _load_env_file(path: Path) -> None:
    """Minimal KEY=VALUE reader; real environment variables always win."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


@dataclass(frozen=True)
class Settings:
    database_url: str | None
    api_url: str
    admin_token: str | None


def get_settings() -> Settings:
    _load_env_file(_ENV_FILE)
    return Settings(
        database_url=os.environ.get("DATABASE_URL") or None,
        api_url=(os.environ.get("RETORNO_API_URL") or "http://localhost:3100").rstrip("/"),
        admin_token=os.environ.get("ML_ADMIN_TOKEN") or None,
    )
