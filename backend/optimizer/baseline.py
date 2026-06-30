"""Greedy 'manual dispatch' baseline.

Deliberately naive: highest priority first, then assign each job to the nearest
qualified technician who can still fit it. No global trade-offs, no lookahead.
It uses the *same* feasibility rules as the CP-SAT optimizer (skills, parts,
shift + overtime), so the comparison is apples-to-apples and the improvement
delta is honest.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from .domain import (
    ASSIGNED,
    UNASSIGNED_SHIFT,
    Assignment,
    Instance,
    JobDC,
    Plan,
    static_unassigned_reason,
)
from .travel import travel_minutes


@dataclass
class _Route:
    """Mutable per-technician routing state during the greedy sweep."""
    pos_x: float
    pos_y: float
    clock: int           # earliest free minute
    count: int           # jobs assigned so far (used as seq)
    horizon: int         # latest minute a job may end


def _horizon(tech, overtime_allowed: bool) -> int:
    if overtime_allowed and tech.overtime_eligible:
        return tech.shift_end + tech.overtime_cap
    return tech.shift_end


def plan_baseline(instance: Instance) -> Plan:
    start_time = time.perf_counter()
    p = instance.params

    routes: dict[int, _Route] = {
        t.id: _Route(t.home_x, t.home_y, t.shift_start, 0, _horizon(t, p.overtime_allowed))
        for t in instance.technicians
    }

    assignments: list[Assignment] = []

    # Priority ascending (1 first), then tightest SLA deadline.
    ordered = sorted(instance.jobs, key=lambda j: (j.priority, j.sla_deadline))

    for job in ordered:
        reason = static_unassigned_reason(instance, job)
        if reason is not None:
            assignments.append(_unassigned(job, reason))
            continue

        best = _best_tech(instance, job, routes)
        if best is None:
            assignments.append(_unassigned(job, UNASSIGNED_SHIFT))
            continue

        tech_id, start, end = best
        route = routes[tech_id]
        tech = instance.tech(tech_id)
        assignments.append(
            Assignment(
                job_id=job.id,
                tech_id=tech_id,
                seq=route.count,
                start=start,
                end=end,
                is_sla_breach=end > job.sla_deadline,
                is_overtime=end > tech.shift_end,
                reason=ASSIGNED,
            )
        )
        route.pos_x, route.pos_y = job.x, job.y
        route.clock = end
        route.count += 1

    elapsed = time.perf_counter() - start_time
    plan = Plan(
        plan_type="baseline",
        assignments=tuple(assignments),
        solve_seconds=elapsed,
        status="greedy",
        objective=0.0,
    )
    return plan


def _best_tech(instance: Instance, job: JobDC, routes: dict[int, _Route]):
    """Nearest qualified technician who can fit the job. Returns (tech_id, start, end)."""
    p = instance.params
    best = None
    best_travel = None
    for tech in instance.certified_techs(job.required_skill):
        route = routes[tech.id]
        leg = travel_minutes(route.pos_x, route.pos_y, job.x, job.y, p.speed_factor, p.traffic_multiplier)
        start = route.clock + leg
        end = start + job.duration
        if end > route.horizon:
            continue
        if best_travel is None or leg < best_travel:
            best_travel = leg
            best = (tech.id, start, end)
    return best


def _unassigned(job: JobDC, reason: str) -> Assignment:
    return Assignment(
        job_id=job.id,
        tech_id=None,
        seq=0,
        start=None,
        end=None,
        is_sla_breach=False,
        is_overtime=False,
        reason=reason,
    )
