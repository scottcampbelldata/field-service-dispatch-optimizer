"""SQLAlchemy ORM models.

Master data (technicians, skills, sites, jobs) plus persisted solve history
(optimization_runs, run_assignments). The same models target SQLite locally and
Postgres in production. Per-run metrics are stored on ``OptimizationRun`` so the
portable analytical views (sql/analytical_views.sql) can present a clean
reporting layer without recomputing route-dependent values in SQL.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Skill(Base):
    __tablename__ = "skills"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50))


class Technician(Base):
    __tablename__ = "technicians"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    home_x: Mapped[float] = mapped_column(Float)
    home_y: Mapped[float] = mapped_column(Float)
    shift_start: Mapped[int] = mapped_column(Integer)
    shift_end: Mapped[int] = mapped_column(Integer)
    overtime_eligible: Mapped[bool] = mapped_column(Boolean)
    overtime_cap: Mapped[int] = mapped_column(Integer)
    skill_ids: Mapped[str] = mapped_column(String(60))  # comma-separated skill ids


class Site(Base):
    __tablename__ = "sites"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    zone: Mapped[str] = mapped_column(String(40))


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"))
    required_skill: Mapped[int] = mapped_column(ForeignKey("skills.id"))
    priority: Mapped[int] = mapped_column(Integer)
    sla_deadline: Mapped[int] = mapped_column(Integer)
    duration: Mapped[int] = mapped_column(Integer)
    requires_part: Mapped[bool] = mapped_column(Boolean)
    part_available: Mapped[bool] = mapped_column(Boolean)
    is_emergency: Mapped[bool] = mapped_column(Boolean)
    status: Mapped[str] = mapped_column(String(20), default="backlog")


class OptimizationRun(Base):
    __tablename__ = "optimization_runs"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    batch_id: Mapped[str] = mapped_column(String(40), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    plan_type: Mapped[str] = mapped_column(String(20))
    params_json: Mapped[dict] = mapped_column(JSON)
    solve_status: Mapped[str] = mapped_column(String(20))
    solve_seconds: Mapped[float] = mapped_column(Float)
    objective_value: Mapped[float] = mapped_column(Float)
    # Stored metrics (computed at save time).
    jobs_completed: Mapped[int] = mapped_column(Integer)
    jobs_total: Mapped[int] = mapped_column(Integer)
    sla_breaches: Mapped[int] = mapped_column(Integer)
    travel_minutes: Mapped[int] = mapped_column(Integer)
    overtime_minutes: Mapped[int] = mapped_column(Integer)
    unassigned: Mapped[int] = mapped_column(Integer)
    high_priority_rate: Mapped[float] = mapped_column(Float)
    avg_utilization: Mapped[float] = mapped_column(Float)
    bottleneck_skill: Mapped[str | None] = mapped_column(String(50), nullable=True)

    assignments: Mapped[list["RunAssignment"]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )


class RunAssignment(Base):
    __tablename__ = "run_assignments"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("optimization_runs.id"))
    job_id: Mapped[int] = mapped_column(Integer)
    tech_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    seq_order: Mapped[int] = mapped_column(Integer)
    planned_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    planned_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_sla_breach: Mapped[bool] = mapped_column(Boolean)
    is_overtime: Mapped[bool] = mapped_column(Boolean)
    unassigned_reason: Mapped[str | None] = mapped_column(String(40), nullable=True)

    run: Mapped["OptimizationRun"] = relationship(back_populates="assignments")
