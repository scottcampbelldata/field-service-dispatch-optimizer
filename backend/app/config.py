"""Application settings.

Reads from environment variables. ``DATABASE_URL`` defaults to a local SQLite
file so the whole stack runs with zero infrastructure; in production it points
at Postgres (see docker-compose.yml).
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./dispatch.db"
    seed: int = 42
    default_solve_seconds: float = 8.0
    cors_origins: str = "*"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
