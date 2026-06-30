"""Serialization helpers turning domain objects into JSON-ready dicts."""

from __future__ import annotations

from backend.optimizer.domain import Assignment, Instance, Plan


def technician_dict(inst: Instance, tech) -> dict:
    return {
        "id": tech.id,
        "name": tech.name,
        "home_x": tech.home_x,
        "home_y": tech.home_y,
        "shift_start": tech.shift_start,
        "shift_end": tech.shift_end,
        "overtime_eligible": tech.overtime_eligible,
        "skills": sorted(inst.skill_name(s) for s in tech.skills),
    }


def job_dict(inst: Instance, job) -> dict:
    return {
        "id": job.id,
        "site_id": job.site_id,
        "site_name": inst.site(job.site_id).name,
        "x": job.x,
        "y": job.y,
        "required_skill": inst.skill_name(job.required_skill),
        "priority": job.priority,
        "sla_deadline": job.sla_deadline,
        "duration": job.duration,
        "requires_part": job.requires_part,
        "part_available": job.part_available,
        "is_emergency": job.is_emergency,
    }


def assignment_dict(inst: Instance, a: Assignment) -> dict:
    job = inst.job(a.job_id)
    return {
        "job_id": a.job_id,
        "tech_id": a.tech_id,
        "seq": a.seq,
        "start": a.start,
        "end": a.end,
        "is_sla_breach": a.is_sla_breach,
        "is_overtime": a.is_overtime,
        "reason": a.reason,
        "priority": job.priority,
        "required_skill": inst.skill_name(job.required_skill),
        "site_name": inst.site(job.site_id).name,
        "x": job.x,
        "y": job.y,
        "duration": job.duration,
    }


def routes(inst: Instance, plan: Plan) -> list[dict]:
    """Per-technician ordered routes (only technicians with work)."""
    out = []
    for tech in inst.technicians:
        stops = [assignment_dict(inst, a) for a in plan.for_tech(tech.id)]
        if stops:
            out.append({
                "tech_id": tech.id,
                "tech_name": tech.name,
                "home_x": tech.home_x,
                "home_y": tech.home_y,
                "stops": stops,
            })
    return out


def unassigned(inst: Instance, plan: Plan) -> list[dict]:
    return [assignment_dict(inst, a) for a in plan.unassigned()]


def workload(inst: Instance) -> dict:
    return {
        "technicians": [technician_dict(inst, t) for t in inst.technicians],
        "sites": [
            {"id": s.id, "name": s.name, "x": s.x, "y": s.y, "zone": s.zone}
            for s in inst.sites
        ],
        "jobs": [job_dict(inst, j) for j in inst.jobs],
        "skills": [{"id": s.id, "name": s.name} for s in inst.skills],
        "region": 100.0,
    }
