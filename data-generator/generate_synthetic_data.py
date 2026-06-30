"""CLI: build the canonical synthetic day and load it into the database.

    python data-generator/generate_synthetic_data.py            # seed if empty
    python data-generator/generate_synthetic_data.py --reset     # drop + reseed

Honors DATABASE_URL (SQLite by default, Postgres in production).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow running as a standalone script.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app.config import settings  # noqa: E402
from backend.app.db import engine, init_db  # noqa: E402
from backend.app.generator import build_base_instance  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app import repository  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the dispatch optimizer database.")
    parser.add_argument("--reset", action="store_true", help="drop all tables first")
    args = parser.parse_args()

    if args.reset:
        print("Dropping existing tables…")
        Base.metadata.drop_all(engine)

    init_db()
    repository.seed_if_empty()

    inst = build_base_instance(seed=settings.seed)
    print(f"Database: {settings.database_url}")
    print(
        f"Seeded canonical day (seed={settings.seed}): "
        f"{len(inst.technicians)} technicians, {len(inst.sites)} sites, "
        f"{len(inst.jobs)} jobs, {len(inst.skills)} skills."
    )


if __name__ == "__main__":
    main()
