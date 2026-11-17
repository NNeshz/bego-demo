# Retorno ML service (FastAPI). Configure with environment variables:
#   DATABASE_URL    Postgres with the logged decisions and model versions (required)
#   ML_ADMIN_TOKEN  enables POST /train over HTTP (optional)
#   PORT            set by the host (Render, Fly, Railway…); defaults to 8100
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_DEV=1 \
    PYTHONUNBUFFERED=1

# Dependencies first: cached across code-only changes.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

COPY src ./src
RUN uv sync --frozen

# Don't run as root.
RUN useradd --create-home app && chown -R app /app
USER app

EXPOSE 8100
CMD ["sh", "-c", "exec /app/.venv/bin/uvicorn retorno_ml.api:app --host 0.0.0.0 --port ${PORT:-8100} --proxy-headers"]
