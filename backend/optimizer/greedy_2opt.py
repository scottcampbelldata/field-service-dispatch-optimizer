"""Strong heuristic baseline: greedy nearest-qualified + 2-opt local search.

``baseline.plan_baseline`` is deliberately naive. It appends each job to the
end of the nearest qualified technician's route and never revisits the decision.
That is a weak foil. A real dispatcher (or ten lines of Excel VBA) does better:
they re-order each technician's day so the driving makes sense and the tight
deadlines land early, and they backfill the gaps that re-ordering opens up.

This module is that comparison. It is what the CP-SAT model actually has to
beat if the claimed improvement is going to mean anything.

Algorithm
---------
1. **Construct**: identical greedy nearest-qualified sweep as ``plan_baseline``
   (priority ascending, then tightest SLA), so both planners start from the
   same place and the delta isolates the improvement pass.
2. **Improve**: repeat until nothing changes:
   a. *2-opt* on every technician's route. Reverse each segment ``[i..j]`` of
      the closed tour ``home -> jobs -> home`` and keep the reversal if it
      lowers route cost. Cost is the operational cost, not raw distance:
      ``w_travel * travel + w_sla * breaches + w_overtime * overtime_minutes``.
      Re-ordering is re-simulated from ``shift_start``, so a move that shortens
      the drive but pushes a job past its deadline is correctly rejected.
   b. *Re-insertion*: 2-opt frees minutes, so try every still-unassigned job at
      every feasible position in every qualified technician's route and take the
      insertion with the best objective gain
      (``priority_reward(job) - delta_cost``). Without this the freed capacity
      would be wasted and the pass would be pointless.

Feasibility rules are identical to the naive baseline and to CP-SAT (skills,
parts, shift end plus overtime cap), and the scoring uses the same weights and
the same travel accounting as ``metrics.compute_objective`` (including the
return-to-home leg), so all three planners are measured on one yardstick.

Pure Python. Imports nothing beyond the domain dataclasses. No solver, no web
framework, no database.
"""

from __future__ import annotations

import time
from typing import Iterable, Optional

from .domain import (
    ASSIGNED,
    UNASSIGNED_SHIFT,
    Assignment,
    Instance,
    Plan,
    TechnicianDC,
    static_unassigned_reason,
)

MAX_ROUNDS = 12


def _horizon(tech: TechnicianDC, overtime_allowed: bool) -> int:
    if overtime_allowed and tech.overtime_eligible:
        return tech.shift_end + tech.overtime_cap
    return tech.shift_end


class _Ctx:
    """Cached instance views.

    ``Instance.job``/``tech`` rebuild an index dict on every call, which is far
    too slow for a local search that evaluates thousands of candidate routes.
    """

    def __init__(self, instance: Instance):
        self.instance = instance
        self.params = instance.params
        self.jobs = {j.id: j for j in instance.jobs}
        self.techs = {t.id: t for t in instance.technicians}
        self.horizon = {
            t.id: _horizon(t, instance.params.overtime_allowed)
            for t in instance.technicians
        }
        self.qualified: dict[int, list[int]] = {}
        for j in instance.jobs:
            self.qualified[j.id] = [
                t.id for t in instance.technicians if t.has_skill(j.required_skill)
            ]
        self._travel: dict[tuple[float, float, float, float], int] = {}

    def travel(self, ax: float, ay: float, bx: float, by: float) -> int:
        key = (ax, ay, bx, by)
        hit = self._travel.get(key)
        if hit is None:
            hit = self.instance.travel(ax, ay, bx, by)
            self._travel[key] = hit
        return hit


def _evaluate(ctx: _Ctx, tech_id: int, route: list[int]) -> Optional[tuple[int, int, int, list[tuple[int, int]]]]:
    """Simulate a route. Returns (travel, breaches, overtime_minutes, [(start, end)])
    or None when the ordering is infeasible (a job would end past the horizon)."""
    tech = ctx.techs[tech_id]
    horizon = ctx.horizon[tech_id]
    px, py = tech.home_x, tech.home_y
    clock = tech.shift_start
    travel = 0
    breaches = 0
    overtime = 0
    times: list[tuple[int, int]] = []

    for job_id in route:
        job = ctx.jobs[job_id]
        leg = ctx.travel(px, py, job.x, job.y)
        travel += leg
        start = clock + leg
        end = start + job.duration
        if end > horizon:
            return None
        if end > job.sla_deadline:
            breaches += 1
        if end > tech.shift_end:
            overtime += end - tech.shift_end
        times.append((start, end))
        clock = end
        px, py = job.x, job.y

    if route:
        # metrics._route_travel_minutes charges the return leg; match it.
        travel += ctx.travel(px, py, tech.home_x, tech.home_y)

    return travel, breaches, overtime, times


def _cost(ctx: _Ctx, travel: int, breaches: int, overtime: int) -> int:
    p = ctx.params
    return p.w_travel * travel + p.w_sla * breaches + p.w_overtime * overtime


def _two_opt(ctx: _Ctx, tech_id: int, route: list[int]) -> list[int]:
    """Reverse-segment local search to a 2-opt local optimum on operational cost."""
    if len(route) < 3:
        return route
    best = list(route)
    ev = _evaluate(ctx, tech_id, best)
    if ev is None:
        return best
    best_cost = _cost(ctx, ev[0], ev[1], ev[2])

    improved = True
    while improved:
        improved = False
        n = len(best)
        for i in range(n - 1):
            for k in range(i + 1, n):
                cand = best[:i] + best[i:k + 1][::-1] + best[k + 1:]
                cev = _evaluate(ctx, tech_id, cand)
                if cev is None:
                    continue
                ccost = _cost(ctx, cev[0], cev[1], cev[2])
                if ccost < best_cost:
                    best, best_cost = cand, ccost
                    improved = True
                    break
            if improved:
                break
    return best


def _try_reinsert(
    ctx: _Ctx,
    routes: dict[int, list[int]],
    route_cost: dict[int, int],
    pending: Iterable[int],
) -> tuple[bool, set[int]]:
    """Insert unassigned jobs wherever they pay for themselves. Returns
    (changed, placed_job_ids)."""
    p = ctx.params
    placed: set[int] = set()
    changed = False

    # Highest-value work first so it claims the good slots.
    order = sorted(
        pending,
        key=lambda jid: (ctx.jobs[jid].priority, ctx.jobs[jid].sla_deadline),
    )

    for job_id in order:
        job = ctx.jobs[job_id]
        reward = p.priority_reward(job.priority)
        best_gain = 0
        best_move: Optional[tuple[int, list[int], int]] = None

        for tech_id in ctx.qualified[job_id]:
            route = routes[tech_id]
            base_cost = route_cost[tech_id]
            for pos in range(len(route) + 1):
                cand = route[:pos] + [job_id] + route[pos:]
                cev = _evaluate(ctx, tech_id, cand)
                if cev is None:
                    continue
                ccost = _cost(ctx, cev[0], cev[1], cev[2])
                gain = reward - (ccost - base_cost)
                if gain > best_gain:
                    best_gain = gain
                    best_move = (tech_id, cand, ccost)

        if best_move is not None:
            tech_id, cand, ccost = best_move
            routes[tech_id] = cand
            route_cost[tech_id] = ccost
            placed.add(job_id)
            changed = True

    return changed, placed


def plan_greedy_2opt(instance: Instance) -> Plan:
    """Greedy nearest-qualified construction + 2-opt + re-insertion."""
    start_wall = time.perf_counter()
    ctx = _Ctx(instance)

    routes: dict[int, list[int]] = {t.id: [] for t in instance.technicians}
    route_cost: dict[int, int] = {t.id: 0 for t in instance.technicians}
    static_blocked: dict[int, str] = {}
    pending: set[int] = set()

    # --- 1. greedy nearest-qualified construction (same rule as plan_baseline)
    clocks = {t.id: t.shift_start for t in instance.technicians}
    pos = {t.id: (t.home_x, t.home_y) for t in instance.technicians}

    ordered = sorted(instance.jobs, key=lambda j: (j.priority, j.sla_deadline))
    for job in ordered:
        reason = static_unassigned_reason(instance, job)
        if reason is not None:
            static_blocked[job.id] = reason
            continue

        best_tech = None
        best_leg = None
        best_end = None
        for tech_id in ctx.qualified[job.id]:
            px, py = pos[tech_id]
            leg = ctx.travel(px, py, job.x, job.y)
            end = clocks[tech_id] + leg + job.duration
            if end > ctx.horizon[tech_id]:
                continue
            if best_leg is None or leg < best_leg:
                best_leg, best_tech, best_end = leg, tech_id, end

        if best_tech is None:
            pending.add(job.id)
            continue

        routes[best_tech].append(job.id)
        clocks[best_tech] = best_end
        pos[best_tech] = (job.x, job.y)

    for tech_id, route in routes.items():
        ev = _evaluate(ctx, tech_id, route)
        route_cost[tech_id] = _cost(ctx, ev[0], ev[1], ev[2]) if ev else 0

    # --- 2. improvement rounds: 2-opt, then backfill the freed capacity
    for _ in range(MAX_ROUNDS):
        changed = False

        for tech_id, route in routes.items():
            if len(route) < 3:
                continue
            new_route = _two_opt(ctx, tech_id, route)
            if new_route != route:
                ev = _evaluate(ctx, tech_id, new_route)
                if ev is not None:
                    routes[tech_id] = new_route
                    route_cost[tech_id] = _cost(ctx, ev[0], ev[1], ev[2])
                    changed = True

        if pending:
            moved, placed = _try_reinsert(ctx, routes, route_cost, pending)
            pending -= placed
            changed = changed or moved

        if not changed:
            break

    # --- 3. emit
    assignments: list[Assignment] = []
    for tech_id, route in routes.items():
        if not route:
            continue
        tech = ctx.techs[tech_id]
        ev = _evaluate(ctx, tech_id, route)
        assert ev is not None, "final route must be feasible"
        _, _, _, times = ev
        for seq, job_id in enumerate(route):
            job = ctx.jobs[job_id]
            start, end = times[seq]
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

    for job_id, reason in static_blocked.items():
        assignments.append(Assignment(job_id, None, 0, None, None, False, False, reason))
    for job_id in pending:
        assignments.append(Assignment(job_id, None, 0, None, None, False, False, UNASSIGNED_SHIFT))

    return Plan(
        plan_type="greedy_2opt",
        assignments=tuple(assignments),
        solve_seconds=time.perf_counter() - start_wall,
        status="greedy_2opt",
        objective=0.0,
    )
