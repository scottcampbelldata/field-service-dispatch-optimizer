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
    default_solve_seconds: float = 12.0
    cors_origins: str = "*"

    # Routing provider for travel times. "haversine" (default, free, offline) or
    # "openrouteservice" / "osrm" for real road durations (bring your own key /
    # endpoint). Falls back to haversine if a provider is misconfigured.
    routing_provider: str = "haversine"
    ors_api_key: str = ""
    osrm_base_url: str = ""
    routing_max_points: int = 50

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
