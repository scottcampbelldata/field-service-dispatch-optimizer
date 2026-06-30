"""Database engine, session factory, and schema/view initialization."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from .config import settings
from .models import Base

_VIEWS_SQL = Path(__file__).resolve().parent.parent / "sql" / "analytical_views.sql"

_connect_args = (
    {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
)

engine = create_engine(settings.database_url, future=True, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def apply_views() -> None:
    """(Re)create the analytical views. Statements are split on ';'."""
    raw = _VIEWS_SQL.read_text(encoding="utf-8")
    # Drop comment-only lines first so they don't swallow following statements.
    code = "\n".join(
        line for line in raw.splitlines() if not line.strip().startswith("--")
    )
    statements = [s.strip() for s in code.split(";") if s.strip()]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def init_db() -> None:
    Base.metadata.create_all(engine)
    apply_views()


def get_session():
    """FastAPI dependency: yields a session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
