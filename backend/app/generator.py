"""Seeded synthetic data generator for Atlas Field Services.

Produces one canonical, reproducible "day" as a domain ``Instance``: a roster of
technicians, a set of customer sites at real lat/long across a metro service
region, and a backlog of service jobs. Same seed => identical instance. The
backlog is deliberately larger than the crews can fully complete, so there is a
real planning problem (and a visible gap between the naive baseline and the
optimizer).

Coordinates are real (Dallas–Fort Worth metro) so the map and a real routing
engine work, but the sites, technicians, and jobs themselves are entirely
synthetic. No proprietary or employer data is used.
"""

from __future__ import annotations

import random

from backend.optimizer.domain import (
    Instance,
    JobDC,
    Params,
    Skill,
    SiteDC,
    TechnicianDC,
)

# Metro service region (Dallas–Fort Worth). x = longitude, y = latitude.
METRO_NAME = "Dallas–Fort Worth"
LON_MIN, LON_MAX = -96.95, -96.55
LAT_MIN, LAT_MAX = 32.70, 33.00
CENTER = ((LON_MIN + LON_MAX) / 2, (LAT_MIN + LAT_MAX) / 2)

SKILL_NAMES = ["HVAC", "Electrical", "Plumbing", "Refrigeration", "Controls", "General"]

DEFAULT_SEED = 42
DEFAULT_TECHS = 12
DEFAULT_SITES = 30
DEFAULT_JOBS = 110


def build_skills() -> tuple[Skill, ...]:
    return tuple(Skill(i + 1, name) for i, name in enumerate(SKILL_NAMES))


def build_base_instance(
    seed: int = DEFAULT_SEED,
    n_techs: int = DEFAULT_TECHS,
    n_sites: int = DEFAULT_SITES,
    n_jobs: int = DEFAULT_JOBS,
) -> Instance:
    rng = random.Random(seed)
    skills = build_skills()
    skill_ids = [s.id for s in skills]

    sites = _build_sites(rng, n_sites)
    technicians = _build_technicians(rng, n_techs, sites, skill_ids)
    jobs = _build_jobs(rng, n_jobs, sites, skill_ids)

    # speed_factor 1.2 min/km ≈ 50 km/h door-to-door; the metro diagonal costs
    # ~60 travel minutes, making a full day's backlog realistically
    # over-subscribed so the optimizer has room to beat the baseline.
    params = Params(speed_factor=1.2)
    return Instance(
        technicians=tuple(technicians),
        sites=tuple(sites),
        jobs=tuple(jobs),
        skills=skills,
        params=params,
    )


def _build_sites(rng: random.Random, n: int) -> list[SiteDC]:
    sites = []
    for i in range(1, n + 1):
        lon = round(rng.uniform(LON_MIN, LON_MAX), 5)
        lat = round(rng.uniform(LAT_MIN, LAT_MAX), 5)
        sites.append(
            SiteDC(id=i, name=f"Site {i:02d}", x=lon, y=lat, zone=_zone_for(lon, lat))
        )
    return sites


def _zone_for(lon: float, lat: float) -> str:
    """Business-readable zone label from position (cosmetic)."""
    cx, cy = CENTER
    if abs(lon - cx) < 0.07 and abs(lat - cy) < 0.05:
        return "Downtown"
    ns = "North" if lat >= cy else "South"
    ew = "East" if lon >= cx else "West"
    return f"{ns} {ew}"


def _build_technicians(rng, n, sites, skill_ids) -> list[TechnicianDC]:
    techs: list[TechnicianDC] = []
    coverage: dict[int, int] = {sid: 0 for sid in skill_ids}

    for i in range(1, n + 1):
        home = rng.choice(sites)
        k = rng.choice([1, 1, 2, 2, 2, 3])
        tech_skills = set(rng.sample(skill_ids, k))
        # 8:00 start, with a couple of crews on an early or late shift.
        start = rng.choice([480, 480, 480, 420, 540])
        end = start + rng.choice([480, 540, 540])  # 8 - 9h shifts
        techs.append(
            TechnicianDC(
                id=i,
                name=f"Tech {i:02d}",
                home_x=home.x,
                home_y=home.y,
                shift_start=start,
                shift_end=end,
                overtime_eligible=rng.random() < 0.8,
                overtime_cap=120,
                skills=frozenset(tech_skills),
            )
        )
        for sid in tech_skills:
            coverage[sid] += 1

    # Guarantee every skill is held by at least two technicians (so the base
    # day is solvable and skill-shortage scenarios are a deliberate toggle).
    for sid, count in coverage.items():
        while coverage[sid] < 2:
            t = rng.choice(techs)
            if sid not in t.skills:
                idx = techs.index(t)
                techs[idx] = _add_skill(t, sid)
                coverage[sid] += 1

    return techs


def _add_skill(tech: TechnicianDC, skill_id: int) -> TechnicianDC:
    from dataclasses import replace

    return replace(tech, skills=frozenset(tech.skills | {skill_id}))


def _build_jobs(rng, n, sites, skill_ids) -> list[JobDC]:
    jobs: list[JobDC] = []
    for i in range(1, n + 1):
        site = rng.choice(sites)
        priority = rng.choices([1, 2, 3, 4], weights=[1, 3, 4, 2])[0]
        duration = rng.choice([30, 45, 60, 60, 90, 120])
        # Tighter deadlines for higher priority work.
        latest = {1: 840, 2: 960, 3: 1080, 4: 1140}[priority]
        sla = rng.randint(660, latest)
        requires_part = rng.random() < 0.30
        part_available = (not requires_part) or (rng.random() < 0.80)
        jobs.append(
            JobDC(
                id=1000 + i,
                site_id=site.id,
                x=site.x,
                y=site.y,
                required_skill=rng.choice(skill_ids),
                priority=priority,
                sla_deadline=sla,
                duration=duration,
                requires_part=requires_part,
                part_available=part_available,
                is_emergency=False,
            )
        )
    return jobs


if __name__ == "__main__":  # pragma: no cover - manual inspection helper
    inst = build_base_instance()
    print(f"technicians={len(inst.technicians)} sites={len(inst.sites)} jobs={len(inst.jobs)}")
