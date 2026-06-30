"""CP-SAT dispatch optimizer.

Models technician dispatch as a vehicle-routing-with-time-windows + assignment
problem. Per technician we build a routing circuit over {home} + candidate jobs
using ``AddCircuit`` (self-loops make a node optional). Job start times respect
travel + service sequencing; SLA breaches and overtime are penalized (or, when
strict, SLA becomes hard for top-priority jobs). The objective maximizes
priority-weighted completion minus travel, SLA, and overtime penalties.

The engine depends only on the domain dataclasses and ``travel`` — no DB.
"""

from __future__ import annotations

import time

from ortools.sat.python import cp_model

from .domain import (
    ASSIGNED,
    UNASSIGNED_CAPACITY,
    Assignment,
    Instance,
    JobDC,
    Plan,
    TechnicianDC,
    static_unassigned_reason,
)
from .travel import travel_minutes


def _horizon(tech: TechnicianDC, overtime_allowed: bool) -> int:
    if overtime_allowed and tech.overtime_eligible:
        return tech.shift_end + tech.overtime_cap
    return tech.shift_end


def _can_attempt(instance: Instance, tech: TechnicianDC, job: JobDC, overtime_allowed: bool) -> bool:
    """Static feasibility of a (tech, job) pair, before routing."""
    if not tech.has_skill(job.required_skill):
        return False
    if job.part_blocked:
        return False
    # Must fit within this technician's available window at all.
    if job.duration > _horizon(tech, overtime_allowed) - tech.shift_start:
        return False
    return True


def plan_optimized(instance: Instance, max_seconds: float | None = None) -> Plan:
    p = instance.params
    max_seconds = max_seconds if max_seconds is not None else p.max_solve_seconds
    model = cp_model.CpModel()
    start_wall = time.perf_counter()

    strict = p.sla_strictness == "strict"

    # Per (tech, job) decision data.
    visit: dict[tuple[int, int], cp_model.IntVar] = {}     # job done by tech
    starts: dict[tuple[int, int], cp_model.IntVar] = {}
    ends: dict[tuple[int, int], cp_model.LinearExpr] = {}
    breach: dict[tuple[int, int], cp_model.IntVar] = {}
    overtime: dict[tuple[int, int], cp_model.IntVar] = {}
    candidates_by_tech: dict[int, list[int]] = {t.id: [] for t in instance.technicians}

    for tech in instance.technicians:
        horizon = _horizon(tech, p.overtime_allowed)
        for job in instance.jobs:
            if not _can_attempt(instance, tech, job, p.overtime_allowed):
                continue
            key = (tech.id, job.id)
            candidates_by_tech[tech.id].append(job.id)
            v = model.NewBoolVar(f"v_t{tech.id}_j{job.id}")
            s = model.NewIntVar(tech.shift_start, horizon - job.duration, f"s_t{tech.id}_j{job.id}")
            e = s + job.duration
            visit[key] = v
            starts[key] = s
            ends[key] = e

            # Overtime minutes used on this assignment (only counts when visited).
            ot = model.NewIntVar(0, max(0, horizon - tech.shift_end), f"ot_t{tech.id}_j{job.id}")
            model.Add(ot >= e - tech.shift_end).OnlyEnforceIf(v)
            model.Add(ot == 0).OnlyEnforceIf(v.Not())
            overtime[key] = ot

            # SLA handling.
            if strict and job.priority == 1:
                # Hard: a visited top-priority job must meet its SLA.
                model.Add(e <= job.sla_deadline).OnlyEnforceIf(v)
                b = model.NewConstant(0)
            else:
                b = model.NewBoolVar(f"b_t{tech.id}_j{job.id}")
                # Force breach=1 when visited and late; free (=0) otherwise.
                model.Add(e <= job.sla_deadline).OnlyEnforceIf([v, b.Not()])
            breach[key] = b

    # Each job done by at most one technician.
    for job in instance.jobs:
        vs = [visit[(t.id, job.id)] for t in instance.technicians if (t.id, job.id) in visit]
        if vs:
            model.Add(sum(vs) <= 1)

    # Per-technician routing circuit + travel sequencing.
    travel_terms: list[cp_model.LinearExpr] = []
    for tech in instance.technicians:
        job_ids = candidates_by_tech[tech.id]
        if not job_ids:
            continue
        # Node 0 = home depot; nodes 1..n map to job_ids.
        node_jobs = {idx + 1: jid for idx, jid in enumerate(job_ids)}
        n = len(job_ids)

        def coords(node: int) -> tuple[float, float]:
            if node == 0:
                return tech.home_x, tech.home_y
            j = instance.job(node_jobs[node])
            return j.x, j.y

        def end_expr(node: int):
            if node == 0:
                return tech.shift_start
            return ends[(tech.id, node_jobs[node])]

        arcs = []
        # Depot self-loop (route may be empty).
        arcs.append((0, 0, model.NewBoolVar(f"loop_t{tech.id}_depot")))
        # Job self-loops == not visited by this tech.
        for node, jid in node_jobs.items():
            arcs.append((node, node, visit[(tech.id, jid)].Not()))

        for i in range(0, n + 1):
            for k in range(0, n + 1):
                if i == k:
                    continue
                lit = model.NewBoolVar(f"arc_t{tech.id}_{i}_{k}")
                arcs.append((i, k, lit))
                ax, ay = coords(i)
                bx, by = coords(k)
                t_ik = travel_minutes(ax, ay, bx, by, p.speed_factor, p.traffic_multiplier)
                if t_ik:
                    travel_terms.append(t_ik * lit)
                # Timing only matters when the head is a job node.
                if k != 0:
                    model.Add(starts[(tech.id, node_jobs[k])] >= end_expr(i) + t_ik).OnlyEnforceIf(lit)

        model.AddCircuit(arcs)

    total_travel = sum(travel_terms) if travel_terms else 0
    total_breach = sum(breach.values()) if breach else 0
    total_overtime = sum(overtime.values()) if overtime else 0
    reward = sum(
        p.priority_reward(instance.job(jid).priority) * v
        for (tid, jid), v in visit.items()
    )

    model.Maximize(
        reward
        - p.w_travel * total_travel
        - p.w_sla * total_breach
        - p.w_overtime * total_overtime
    )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(max_seconds)
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)
    elapsed = time.perf_counter() - start_wall

    status_name = solver.StatusName(status)
    has_solution = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)

    assignments = _extract(instance, solver, visit, starts, has_solution)
    objective = solver.ObjectiveValue() if has_solution else 0.0

    return Plan(
        plan_type="optimized",
        assignments=tuple(assignments),
        solve_seconds=elapsed,
        status=status_name,
        objective=objective,
    )


def _extract(instance, solver, visit, starts, has_solution) -> list[Assignment]:
    assignments: list[Assignment] = []
    assigned_job_ids: set[int] = set()

    if has_solution:
        # Group chosen visits per technician, then order by start time.
        per_tech: dict[int, list[tuple[int, int]]] = {}  # tech -> [(start, job_id)]
        for (tech_id, job_id), v in visit.items():
            if solver.Value(v) == 1:
                start = solver.Value(starts[(tech_id, job_id)])
                per_tech.setdefault(tech_id, []).append((start, job_id))
                assigned_job_ids.add(job_id)
        for tech_id, items in per_tech.items():
            tech = instance.tech(tech_id)
            for seq, (start, job_id) in enumerate(sorted(items)):
                job = instance.job(job_id)
                end = start + job.duration
                assignments.append(
                    Assignment(
                        job_id=job_id,
                        tech_id=tech_id,
                        seq=seq,
                        start=start,
                        end=end,
                        is_sla_breach=end > job.sla_deadline,
                        is_overtime=end > tech.shift_end,
                        reason=ASSIGNED,
                    )
                )

    # Anything not assigned gets a reason code.
    for job in instance.jobs:
        if job.id in assigned_job_ids:
            continue
        reason = static_unassigned_reason(instance, job) or UNASSIGNED_CAPACITY
        assignments.append(
            Assignment(
                job_id=job.id,
                tech_id=None,
                seq=0,
                start=None,
                end=None,
                is_sla_breach=False,
                is_overtime=False,
                reason=reason,
            )
        )
    return assignments
