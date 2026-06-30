"""Persistence layer: seed master data, save solve runs, read them back.

The optimizer always works from the deterministic in-memory ``Instance`` built
by the generator. Master data is mirrored into the database so the analytical
views can join run history against jobs/skills/technicians, and each solve is
persisted for the comparison page and run-history endpoints.
"""

from __future__ import annotations

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.db import SessionLocal, init_db
from backend.app.generator import build_base_instance
from backend.app.models import Job, OptimizationRun, RunAssignment, Site, Skill, Technician
from backend.optimizer.domain import Instance, Plan


def load_base() -> Instance:
    """The canonical day. Deterministic, so it matches the seeded DB rows."""
    return build_base_instance(seed=settings.seed)


def seed_if_empty() -> None:
    """Create schema + views and load master data once."""
    init_db()
    with SessionLocal() as session:
        if session.scalar(select(Skill.id).limit(1)) is not None:
            return
        _seed_master(session, load_base())
        session.commit()


def _seed_master(session: Session, inst: Instance) -> None:
    for s in inst.skills:
        session.add(Skill(id=s.id, name=s.name))
    for t in inst.technicians:
        session.add(
            Technician(
                id=t.id, name=t.name, home_x=t.home_x, home_y=t.home_y,
                shift_start=t.shift_start, shift_end=t.shift_end,
                overtime_eligible=t.overtime_eligible, overtime_cap=t.overtime_cap,
                skill_ids=",".join(str(i) for i in sorted(t.skills)),
            )
        )
    for site in inst.sites:
        session.add(Site(id=site.id, name=site.name, x=site.x, y=site.y, zone=site.zone))
    # Flush parents (skills, sites) before adding jobs. Job.site_id / required_skill
    # are bare ForeignKey columns with no relationship(), so the unit of work does
    # not guarantee parents insert first. SQLite ignores FKs, but Postgres enforces
    # them and rejects the jobs batch otherwise.
    session.flush()
    for j in inst.jobs:
        session.add(
            Job(
                id=j.id, site_id=j.site_id, required_skill=j.required_skill,
                priority=j.priority, sla_deadline=j.sla_deadline, duration=j.duration,
                requires_part=j.requires_part, part_available=j.part_available,
                is_emergency=j.is_emergency, status="backlog",
            )
        )


def save_run(
    session: Session,
    batch_id: str,
    plan: Plan,
    metrics: dict,
    params: dict,
) -> int:
    run = OptimizationRun(
        batch_id=batch_id,
        plan_type=plan.plan_type,
        params_json=params,
        solve_status=plan.status,
        solve_seconds=round(plan.solve_seconds, 3),
        objective_value=float(metrics["objective"]),
        jobs_completed=metrics["jobs_completed"],
        jobs_total=metrics["jobs_total"],
        sla_breaches=metrics["sla_breaches"],
        travel_minutes=metrics["travel_minutes"],
        overtime_minutes=metrics["overtime_minutes"],
        unassigned=metrics["unassigned"],
        high_priority_rate=metrics["high_priority_protected_rate"],
        avg_utilization=metrics["avg_utilization"],
        bottleneck_skill=metrics["bottleneck_skill"],
    )
    for a in plan.assignments:
        run.assignments.append(
            RunAssignment(
                job_id=a.job_id,
                tech_id=a.tech_id,
                seq_order=a.seq,
                planned_start=a.start,
                planned_end=a.end,
                is_sla_breach=a.is_sla_breach,
                is_overtime=a.is_overtime,
                unassigned_reason=None if a.assigned else a.reason,
            )
        )
    session.add(run)
    session.flush()           # populate run.id
    run_id = run.id
    session.commit()
    return run_id


def run_metrics(session: Session, run_id: int) -> dict | None:
    """Read a run's scorecard from the analytical view (the BI layer)."""
    row = session.execute(
        text("SELECT * FROM v_run_metrics WHERE run_id = :rid"), {"rid": run_id}
    ).mappings().first()
    return dict(row) if row else None


def run_utilization(session: Session, run_id: int) -> list[dict]:
    rows = session.execute(
        text("SELECT * FROM v_run_utilization WHERE run_id = :rid ORDER BY tech_id"),
        {"rid": run_id},
    ).mappings().all()
    return [dict(r) for r in rows]
