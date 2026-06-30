"""Plan metrics and baseline-vs-optimized comparison.

``compute_objective`` reproduces exactly the objective CP-SAT maximizes, so the
two planners can be compared on equal footing. The reporting metrics power the
"Baseline vs Optimized" page and mirror the SQL analytical views.
"""

from __future__ import annotations

from collections import defaultdict

from .domain import Instance, Plan
from .travel import travel_minutes


def _route_travel_minutes(instance: Instance, plan: Plan) -> int:
    """Total travel minutes across all routes (home -> jobs -> home)."""
    p = instance.params
    total = 0
    for tech in instance.technicians:
        route = plan.for_tech(tech.id)
        if not route:
            continue
        px, py = tech.home_x, tech.home_y
        for a in route:
            job = instance.job(a.job_id)
            total += travel_minutes(px, py, job.x, job.y, p.speed_factor, p.traffic_multiplier)
            px, py = job.x, job.y
        # return to home base
        total += travel_minutes(px, py, tech.home_x, tech.home_y, p.speed_factor, p.traffic_multiplier)
    return total


def _overtime_minutes(instance: Instance, plan: Plan) -> int:
    total = 0
    for a in plan.assigned():
        tech = instance.tech(a.tech_id)
        if a.end is not None and a.end > tech.shift_end:
            total += a.end - tech.shift_end
    return total


def compute_objective(instance: Instance, plan: Plan) -> int:
    """Objective value using the same formula CP-SAT maximizes."""
    p = instance.params
    reward = sum(p.priority_reward(instance.job(a.job_id).priority) for a in plan.assigned())
    travel = _route_travel_minutes(instance, plan)
    breaches = sum(1 for a in plan.assigned() if a.is_sla_breach)
    overtime = _overtime_minutes(instance, plan)
    return reward - p.w_travel * travel - p.w_sla * breaches - p.w_overtime * overtime


def plan_metrics(instance: Instance, plan: Plan) -> dict:
    """Reporting metrics for a single plan."""
    assigned = plan.assigned()
    unassigned = plan.unassigned()
    travel_min = _route_travel_minutes(instance, plan)
    overtime_min = _overtime_minutes(instance, plan)
    breaches = sum(1 for a in assigned if a.is_sla_breach)

    high_priority_total = sum(1 for j in instance.jobs if j.priority == 1)
    high_priority_done = sum(
        1 for a in assigned if instance.job(a.job_id).priority == 1
    )
    high_priority_rate = (
        round(100.0 * high_priority_done / high_priority_total, 1)
        if high_priority_total else 100.0
    )

    # Per-technician utilization = busy minutes / shift minutes.
    utilization: dict[int, float] = {}
    busy_by_tech: dict[int, int] = defaultdict(int)
    for a in assigned:
        if a.start is not None and a.end is not None:
            busy_by_tech[a.tech_id] += a.end - a.start
    for tech in instance.technicians:
        shift_minutes = max(1, tech.shift_end - tech.shift_start)
        utilization[tech.id] = round(
            100.0 * busy_by_tech.get(tech.id, 0) / shift_minutes, 1
        )

    # Bottleneck skill: skill with the most unassigned + breached demand.
    pain_by_skill: dict[int, int] = defaultdict(int)
    for a in unassigned:
        pain_by_skill[instance.job(a.job_id).required_skill] += 1
    for a in assigned:
        if a.is_sla_breach:
            pain_by_skill[instance.job(a.job_id).required_skill] += 1
    if pain_by_skill:
        worst_skill_id = max(pain_by_skill, key=pain_by_skill.get)
        bottleneck_skill = instance.skill_name(worst_skill_id)
    else:
        bottleneck_skill = None

    return {
        "plan_type": plan.plan_type,
        "jobs_completed": len(assigned),
        "jobs_total": len(instance.jobs),
        "sla_breaches": breaches,
        "travel_hours": round(travel_min / 60.0, 1),
        "overtime_hours": round(overtime_min / 60.0, 1),
        "unassigned": len(unassigned),
        "high_priority_protected_rate": high_priority_rate,
        "bottleneck_skill": bottleneck_skill,
        "utilization": utilization,
        "avg_utilization": round(
            sum(utilization.values()) / len(utilization), 1
        ) if utilization else 0.0,
        "objective": compute_objective(instance, plan),
        "solve_seconds": round(plan.solve_seconds, 3),
        "status": plan.status,
    }


def compare(baseline: dict, optimized: dict) -> dict:
    """Deltas (optimized - baseline) for the headline comparison."""
    return {
        "jobs_completed_delta": optimized["jobs_completed"] - baseline["jobs_completed"],
        "sla_breaches_delta": optimized["sla_breaches"] - baseline["sla_breaches"],
        "travel_hours_delta": round(optimized["travel_hours"] - baseline["travel_hours"], 1),
        "overtime_hours_delta": round(optimized["overtime_hours"] - baseline["overtime_hours"], 1),
        "unassigned_delta": optimized["unassigned"] - baseline["unassigned"],
        "objective_delta": optimized["objective"] - baseline["objective"],
    }
