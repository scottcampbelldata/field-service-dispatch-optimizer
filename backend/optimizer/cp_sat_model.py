"""CP-SAT dispatch optimizer.

Models technician dispatch as a vehicle-routing-with-time-windows + assignment
problem. Per technician we build a routing circuit over {home} + candidate jobs
using ``AddCircuit`` (self-loops make a node optional). Job start times respect
travel + service sequencing; SLA breaches and overtime are penalized (or, when
strict, SLA becomes hard for top-priority jobs). The objective maximizes
priority-weighted completion minus travel, SLA, and overtime penalties.

Two techniques keep live solves tractable and trustworthy:

* **Candidate capping** — each technician only considers its nearest feasible
  jobs (plus everything the baseline gave it), so routing circuits stay small.
* **Warm start** — the greedy baseline is hinted as a complete feasible
  solution, so the solver always has an incumbent at least as good as the
  baseline and returns a usable plan even when it cannot prove optimality.

The engine depends only on the domain dataclasses and ``travel`` — no DB.
"""

from __future__ import annotations

import time

from ortools.sat.python import cp_model

from .baseline import plan_baseline
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

DEFAULT_MAX_CANDIDATES = 18


def _horizon(tech: TechnicianDC, overtime_allowed: bool) -> int:
    if overtime_allowed and tech.overtime_eligible:
        return tech.shift_end + tech.overtime_cap
    return tech.shift_end


def _can_attempt(instance: Instance, tech: TechnicianDC, job: JobDC, overtime_allowed: bool) -> bool:
    if not tech.has_skill(job.required_skill):
        return False
    if job.part_blocked:
        return False
    if job.duration > _horizon(tech, overtime_allowed) - tech.shift_start:
        return False
    return True


def _select_candidates(instance, warm, max_candidates) -> dict[int, list[int]]:
    """Per-technician candidate job ids: the nearest feasible jobs, unioned with
    whatever the baseline assigned to that technician (so the warm start is
    always representable and optimized >= baseline holds)."""
    p = instance.params
    by_tech: dict[int, set[int]] = {t.id: set() for t in instance.technicians}

    for tech in instance.technicians:
        feasible = [
            j for j in instance.jobs
            if _can_attempt(instance, tech, j, p.overtime_allowed)
        ]
        feasible.sort(
            key=lambda j: travel_minutes(tech.home_x, tech.home_y, j.x, j.y,
                                         p.speed_factor, p.traffic_multiplier)
        )
        by_tech[tech.id].update(j.id for j in feasible[:max_candidates])

    for a in warm.assigned():
        by_tech[a.tech_id].add(a.job_id)

    return {tid: sorted(ids) for tid, ids in by_tech.items()}


def plan_optimized(
    instance: Instance,
    max_seconds: float | None = None,
    warm_start: Plan | None = None,
    max_candidates: int = DEFAULT_MAX_CANDIDATES,
) -> Plan:
    p = instance.params
    max_seconds = max_seconds if max_seconds is not None else p.max_solve_seconds
    warm = warm_start if warm_start is not None else plan_baseline(instance)
    start_wall = time.perf_counter()

    model = cp_model.CpModel()
    strict = p.sla_strictness == "strict"
    candidates_by_tech = _select_candidates(instance, warm, max_candidates)

    visit: dict[tuple[int, int], cp_model.IntVar] = {}
    starts: dict[tuple[int, int], cp_model.IntVar] = {}
    ends: dict[tuple[int, int], object] = {}
    breach: dict[tuple[int, int], cp_model.IntVar] = {}
    overtime: dict[tuple[int, int], cp_model.IntVar] = {}

    for tech in instance.technicians:
        horizon = _horizon(tech, p.overtime_allowed)
        for job_id in candidates_by_tech[tech.id]:
            job = instance.job(job_id)
            key = (tech.id, job_id)
            v = model.NewBoolVar(f"v_t{tech.id}_j{job_id}")
            s = model.NewIntVar(tech.shift_start, horizon - job.duration, f"s_t{tech.id}_j{job_id}")
            e = s + job.duration
            visit[key], starts[key], ends[key] = v, s, e

            ot = model.NewIntVar(0, max(0, horizon - tech.shift_end), f"ot_t{tech.id}_j{job_id}")
            model.Add(ot >= e - tech.shift_end).OnlyEnforceIf(v)
            model.Add(ot == 0).OnlyEnforceIf(v.Not())
            overtime[key] = ot

            if strict and job.priority == 1:
                model.Add(e <= job.sla_deadline).OnlyEnforceIf(v)
                breach[key] = model.NewConstant(0)
            else:
                b = model.NewBoolVar(f"b_t{tech.id}_j{job_id}")
                model.Add(e <= job.sla_deadline).OnlyEnforceIf([v, b.Not()])
                breach[key] = b

    # Each job done by at most one technician.
    for job in instance.jobs:
        vs = [visit[(t.id, job.id)] for t in instance.technicians if (t.id, job.id) in visit]
        if vs:
            model.Add(sum(vs) <= 1)

    # Per-technician routing circuit + travel sequencing.
    travel_terms = []
    arc_vars: dict[tuple[int, int, int], cp_model.IntVar] = {}   # (tech, i, k) -> lit
    depot_loop: dict[int, cp_model.IntVar] = {}
    node_jobs_by_tech: dict[int, dict[int, int]] = {}

    for tech in instance.technicians:
        job_ids = candidates_by_tech[tech.id]
        if not job_ids:
            continue
        node_jobs = {idx + 1: jid for idx, jid in enumerate(job_ids)}
        node_jobs_by_tech[tech.id] = node_jobs
        n = len(job_ids)

        def coords(node: int) -> tuple[float, float]:
            if node == 0:
                return tech.home_x, tech.home_y
            j = instance.job(node_jobs[node])
            return j.x, j.y

        def end_expr(node: int):
            return tech.shift_start if node == 0 else ends[(tech.id, node_jobs[node])]

        arcs = []
        loop = model.NewBoolVar(f"loop_t{tech.id}_depot")
        depot_loop[tech.id] = loop
        arcs.append((0, 0, loop))
        for node, jid in node_jobs.items():
            arcs.append((node, node, visit[(tech.id, jid)].Not()))

        for i in range(0, n + 1):
            for k in range(0, n + 1):
                if i == k:
                    continue
                lit = model.NewBoolVar(f"arc_t{tech.id}_{i}_{k}")
                arc_vars[(tech.id, i, k)] = lit
                arcs.append((i, k, lit))
                ax, ay = coords(i)
                bx, by = coords(k)
                t_ik = travel_minutes(ax, ay, bx, by, p.speed_factor, p.traffic_multiplier)
                if t_ik:
                    travel_terms.append(t_ik * lit)
                if k != 0:
                    model.Add(starts[(tech.id, node_jobs[k])] >= end_expr(i) + t_ik).OnlyEnforceIf(lit)

        model.AddCircuit(arcs)

    reward = sum(
        p.priority_reward(instance.job(jid).priority) * v
        for (tid, jid), v in visit.items()
    )
    model.Maximize(
        reward
        - p.w_travel * (sum(travel_terms) if travel_terms else 0)
        - p.w_sla * (sum(breach.values()) if breach else 0)
        - p.w_overtime * (sum(overtime.values()) if overtime else 0)
    )

    _hint_from_baseline(model, instance, warm, visit, starts, arc_vars, depot_loop, node_jobs_by_tech)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(max_seconds)
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)
    elapsed = time.perf_counter() - start_wall

    has_solution = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
    assignments = _extract(instance, solver, visit, starts, has_solution)
    objective = solver.ObjectiveValue() if has_solution else 0.0

    return Plan(
        plan_type="optimized",
        assignments=tuple(assignments),
        solve_seconds=elapsed,
        status=solver.StatusName(status),
        objective=objective,
    )


def _hint_from_baseline(model, instance, warm, visit, starts, arc_vars, depot_loop, node_jobs_by_tech):
    """Hint the baseline as a complete, consistent feasible solution."""
    assigned_pairs = {(a.tech_id, a.job_id): a for a in warm.assigned()}

    # Visit + start hints.
    for (tech_id, job_id), v in visit.items():
        a = assigned_pairs.get((tech_id, job_id))
        if a is not None:
            model.AddHint(v, 1)
            model.AddHint(starts[(tech_id, job_id)], a.start)
        else:
            model.AddHint(v, 0)

    # Arc hints: reconstruct each technician's baseline route as on-arcs.
    for tech in instance.technicians:
        node_jobs = node_jobs_by_tech.get(tech.id)
        if node_jobs is None:
            continue
        job_to_node = {jid: node for node, jid in node_jobs.items()}
        route = [a.job_id for a in warm.for_tech(tech.id)]
        on_arcs: set[tuple[int, int]] = set()
        if route:
            model.AddHint(depot_loop[tech.id], 0)
            prev = 0
            for jid in route:
                node = job_to_node[jid]
                on_arcs.add((prev, node))
                prev = node
            on_arcs.add((prev, 0))  # return to depot
        else:
            model.AddHint(depot_loop[tech.id], 1)
        for (tid, i, k), lit in arc_vars.items():
            if tid != tech.id:
                continue
            model.AddHint(lit, 1 if (i, k) in on_arcs else 0)


def _extract(instance, solver, visit, starts, has_solution) -> list[Assignment]:
    assignments: list[Assignment] = []
    assigned_job_ids: set[int] = set()

    if has_solution:
        per_tech: dict[int, list[tuple[int, int]]] = {}
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
                        job_id=job_id, tech_id=tech_id, seq=seq, start=start, end=end,
                        is_sla_breach=end > job.sla_deadline,
                        is_overtime=end > tech.shift_end,
                        reason=ASSIGNED,
                    )
                )

    for job in instance.jobs:
        if job.id in assigned_job_ids:
            continue
        reason = static_unassigned_reason(instance, job) or UNASSIGNED_CAPACITY
        assignments.append(
            Assignment(job.id, None, 0, None, None, False, False, reason)
        )
    return assignments
