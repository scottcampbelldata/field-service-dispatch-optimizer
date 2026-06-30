import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker

from backend.app.db import _VIEWS_SQL
from backend.app.generator import build_base_instance
from backend.app.models import Base
from backend.app.repository import _seed_master, save_run
from backend.optimizer.baseline import plan_baseline
from backend.optimizer.cp_sat_model import plan_optimized
from backend.optimizer.metrics import plan_metrics
from backend.optimizer.transform import transform


def _apply_views(engine):
    raw = _VIEWS_SQL.read_text(encoding="utf-8")
    code = "\n".join(line for line in raw.splitlines() if not line.strip().startswith("--"))
    with engine.begin() as conn:
        for stmt in [s.strip() for s in code.split(";") if s.strip()]:
            conn.execute(sa.text(stmt))


def test_seed_save_and_view_roundtrip(tmp_path):
    engine = sa.create_engine(f"sqlite:///{tmp_path/'t.db'}", future=True)
    Base.metadata.create_all(engine)
    _apply_views(engine)
    Session = sessionmaker(bind=engine, future=True)

    inst = transform(build_base_instance(), job_count=30, technician_count=6, max_solve_seconds=3)
    with Session() as s:
        _seed_master(s, build_base_instance())
        s.commit()

        base = plan_baseline(inst)
        opt = plan_optimized(inst, warm_start=base)
        for plan in (base, opt):
            m = plan_metrics(inst, plan)
            rid = save_run(s, "batch1", plan, m, {"job_count": 30})
            view = s.execute(
                sa.text("SELECT * FROM v_run_metrics WHERE run_id = :r"), {"r": rid}
            ).mappings().first()
            assert view is not None
            assert view["jobs_completed"] == m["jobs_completed"]
            assert view["sla_breaches"] == m["sla_breaches"]

        util = s.execute(sa.text("SELECT * FROM v_run_utilization")).mappings().all()
        assert len(util) > 0
        assert all(0 <= r["utilization_pct"] <= 200 for r in util)

        pain = s.execute(sa.text("SELECT * FROM v_skill_pain")).mappings().all()
        assert len(pain) > 0
