"""Translate user-facing slider parameters into a concrete solver Instance.

The generator produces one canonical "day" (the base Instance). Each optimize
request transforms that base — subsetting technicians, scaling the job backlog,
injecting emergencies, simulating a skill shortage, and resolving objective
weights — before both planners run on the result. Transforms are deterministic
(index-based, no RNG) so the same sliders always produce the same scenario.
"""

from __future__ import annotations

from dataclasses import replace

from .domain import Instance, JobDC, Params, TechnicianDC

GOALS = ("balanced", "max_jobs", "min_travel", "protect_sla")
STRICTNESS = ("lenient", "normal", "strict")


def default_user_params() -> dict:
    return {
        "technician_count": None,        # None => use all
        "job_count": None,
        "traffic_penalty": 1.0,          # travel multiplier, 1.0 .. 3.0
        "emergency_rate": 0.0,           # 0 .. 1 fraction of jobs flagged emergency
        "skill_shortage": None,          # skill name to make scarce
        "sla_strictness": "normal",      # lenient | normal | strict
        "overtime_allowed": True,
        "optimization_goal": "balanced",
        "max_solve_seconds": 8.0,
    }


def _resolve_weights(goal: str, strictness: str) -> dict:
    w = {"w_completed": 300, "w_travel": 1, "w_sla": 250, "w_overtime": 3}
    if goal == "max_jobs":
        w["w_completed"] = 450
    elif goal == "min_travel":
        w["w_travel"] = 6
    elif goal == "protect_sla":
        w["w_sla"] = 600
    if strictness == "lenient":
        w["w_sla"] = max(50, w["w_sla"] // 2)
    elif strictness == "strict":
        w["w_sla"] = max(w["w_sla"], 500)
    return w


def transform(base: Instance, **kw) -> Instance:
    p = {**default_user_params(), **{k: v for k, v in kw.items() if v is not None or k in kw}}

    goal = p["optimization_goal"] if p["optimization_goal"] in GOALS else "balanced"
    strictness = p["sla_strictness"] if p["sla_strictness"] in STRICTNESS else "normal"

    # --- technicians: subset + optional skill shortage --------------------
    techs = list(base.technicians)
    if p["technician_count"]:
        techs = techs[: int(p["technician_count"])]

    if p["skill_shortage"]:
        skill_id = next(
            (s.id for s in base.skills if s.name.lower() == str(p["skill_shortage"]).lower()),
            None,
        )
        if skill_id is not None:
            techs = _apply_skill_shortage(techs, skill_id)

    # --- jobs: subset + emergency injection -------------------------------
    jobs = list(base.jobs)
    if p["job_count"]:
        jobs = jobs[: int(p["job_count"])]

    rate = float(p["emergency_rate"] or 0.0)
    if rate > 0:
        jobs = _inject_emergencies(jobs, rate)

    weights = _resolve_weights(goal, strictness)
    params = Params(
        speed_factor=base.params.speed_factor,
        traffic_multiplier=max(1.0, float(p["traffic_penalty"] or 1.0)),
        overtime_allowed=bool(p["overtime_allowed"]),
        sla_strictness=strictness,
        optimization_goal=goal,
        max_solve_seconds=float(p["max_solve_seconds"] or 8.0),
        **weights,
    )

    return replace(base, technicians=tuple(techs), jobs=tuple(jobs), params=params)


def _apply_skill_shortage(techs: list[TechnicianDC], skill_id: int) -> list[TechnicianDC]:
    """Keep the skill on only the first certified technician; strip the rest."""
    seen = False
    out: list[TechnicianDC] = []
    for t in techs:
        if skill_id in t.skills:
            if seen:
                out.append(replace(t, skills=frozenset(t.skills - {skill_id})))
                continue
            seen = True
        out.append(t)
    return out


def _inject_emergencies(jobs: list[JobDC], rate: float) -> list[JobDC]:
    """Flag every Nth job as an emergency: priority 1 + tightened SLA."""
    step = max(1, round(1.0 / rate)) if rate > 0 else len(jobs) + 1
    out: list[JobDC] = []
    for i, j in enumerate(jobs):
        if i % step == 0:
            tight = min(j.sla_deadline, j.sla_deadline - 60)
            out.append(replace(j, is_emergency=True, priority=1, sla_deadline=max(j.duration, tight)))
        else:
            out.append(j)
    return out
