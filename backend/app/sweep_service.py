"""Marginal Value of Capacity analysis.

Sweeps technician count (optionally with overtime on and off) through the
optimizer and reports how the optimized plan's KPIs respond, so the app can
answer "should we hire another technician, or just allow overtime — and where do
returns flatten?" Reuses the optimizer and metrics; nothing is persisted.
"""

from __future__ import annotations

from backend.app import repository, routing
from backend.optimizer.cp_sat_model import plan_optimized
from backend.optimizer.metrics import plan_metrics

MAX_STEPS = 8


def _tech_counts(min_techs: int, max_techs: int, steps: int) -> list[int]:
    """Evenly spaced, de-duplicated technician counts across [min, max]."""
    min_techs = max(1, min_techs)
    max_techs = max(min_techs, max_techs)
    steps = max(2, min(MAX_STEPS, steps))
    if max_techs == min_techs:
        return [min_techs]
    span = max_techs - min_techs
    raw = [round(min_techs + span * i / (steps - 1)) for i in range(steps)]
    out: list[int] = []
    for n in raw:
        if n not in out:
            out.append(n)
    return out


def marginal_value(series: list[dict]) -> tuple[list[dict], int | None]:
    """Per-added-technician deltas for one series (sorted by technician_count).

    Returns (marginal_rows, diminishing_at) where diminishing_at is the first
    technician count whose marginal job gain drops below 1.
    """
    rows = sorted(series, key=lambda p: p["technician_count"])
    marginal: list[dict] = []
    diminishing_at: int | None = None
    for prev, cur in zip(rows, rows[1:]):
        dj = cur["jobs_completed"] - prev["jobs_completed"]
        db = cur["sla_breaches"] - prev["sla_breaches"]
        marginal.append({
            "technician_count": cur["technician_count"],
            "delta_jobs": dj,
            "delta_breaches": db,
        })
        if diminishing_at is None and dj < 1:
            diminishing_at = cur["technician_count"]
    return marginal, diminishing_at


def _point(metrics: dict, n: int, ot: bool) -> dict:
    return {
        "technician_count": n,
        "overtime_allowed": ot,
        "jobs_completed": metrics["jobs_completed"],
        "sla_breaches": metrics["sla_breaches"],
        "unassigned": metrics["unassigned"],
        "overtime_hours": metrics["overtime_hours"],
        "travel_hours": metrics["travel_hours"],
    }


def _narrative(on_series: list[dict], off_series: list[dict], diminishing_at: int | None) -> str:
    if not on_series:
        return "No capacity points were computed."
    on = sorted(on_series, key=lambda p: p["technician_count"])
    lo, hi = on[0], on[-1]
    parts = [
        f"Scaling the crew from {lo['technician_count']} to {hi['technician_count']} "
        f"technicians lifts completed jobs from {lo['jobs_completed']} to {hi['jobs_completed']} "
        f"and cuts SLA breaches from {lo['sla_breaches']} to {hi['sla_breaches']}."
    ]
    if diminishing_at is not None:
        parts.append(
            f"Returns flatten beyond {diminishing_at} technicians — each additional "
            f"hire then adds less than one job."
        )
    else:
        parts.append("Every added technician is still pulling its weight across this range.")
    if off_series:
        off = {p["technician_count"]: p for p in off_series}
        top = hi["technician_count"]
        if top in off:
            dj = hi["jobs_completed"] - off[top]["jobs_completed"]
            dbr = off[top]["sla_breaches"] - hi["sla_breaches"]
            if dj > 0 or dbr > 0:
                parts.append(
                    f"At {top} technicians, allowing overtime is worth about {dj} more "
                    f"jobs and {dbr} fewer SLA breaches — the trade-off against another hire."
                )
    return " ".join(parts)


def capacity_sweep(
    params: dict,
    *,
    min_techs: int = 4,
    max_techs: int | None = None,
    steps: int = 5,
    per_point_seconds: float = 3.0,
    include_overtime_off: bool = True,
    routing_override: dict | None = None,
) -> dict:
    from backend.optimizer.transform import transform

    base = repository.load_base()
    roster = len(base.technicians)
    max_techs = roster if max_techs is None else min(max_techs, roster)
    per_point_seconds = max(1.0, min(10.0, per_point_seconds))
    counts = _tech_counts(min_techs, max_techs, steps)

    scenario = {k: v for k, v in params.items() if k not in ("technician_count", "overtime_allowed", "max_solve_seconds")}

    series_flags = [True] + ([False] if include_overtime_off else [])
    points: list[dict] = []
    for ot in series_flags:
        for n in counts:
            inst = transform(
                base,
                technician_count=n,
                overtime_allowed=ot,
                max_solve_seconds=per_point_seconds,
                **scenario,
            )
            travel_fn, _ = routing.build_travel_provider(inst, override=routing_override)
            if travel_fn is not None:
                from dataclasses import replace
                inst = replace(inst, travel_provider=travel_fn)
            opt = plan_optimized(inst, max_seconds=per_point_seconds)
            points.append(_point(plan_metrics(inst, opt), n, ot))

    on_series = [p for p in points if p["overtime_allowed"]]
    off_series = [p for p in points if not p["overtime_allowed"]]
    marginal, diminishing_at = marginal_value(on_series)

    return {
        "points": points,
        "marginal": marginal,
        "diminishing_at": diminishing_at,
        "narrative": _narrative(on_series, off_series, diminishing_at),
        "technician_counts": counts,
    }
