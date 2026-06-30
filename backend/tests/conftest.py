"""Shared test helpers for building small, hand-checkable instances."""

from __future__ import annotations

import os
import pathlib
import tempfile

# Point the whole test session at a throwaway SQLite file so the global engine
# never touches the developer's real ./dispatch.db. Must run before any import
# of backend.app.config / db.
_TEST_DB = pathlib.Path(tempfile.gettempdir()) / "dispatch_test.db"
if _TEST_DB.exists():
    _TEST_DB.unlink()
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"

from backend.optimizer.domain import (
    Instance,
    JobDC,
    Params,
    Skill,
    SiteDC,
    TechnicianDC,
)
from backend.optimizer.travel import make_euclidean_provider

HVAC = 1
ELEC = 2

SKILLS = (Skill(HVAC, "HVAC"), Skill(ELEC, "Electrical"))


def make_tech(tid, x, y, skills, *, shift=(480, 1020), ot=True, ot_cap=120, name=None):
    return TechnicianDC(
        id=tid,
        name=name or f"Tech {tid}",
        home_x=x,
        home_y=y,
        shift_start=shift[0],
        shift_end=shift[1],
        overtime_eligible=ot,
        overtime_cap=ot_cap,
        skills=frozenset(skills),
    )


def make_job(jid, x, y, skill, *, priority=2, sla=1020, dur=60,
             requires_part=False, part_available=True, emergency=False, site_id=None):
    return JobDC(
        id=jid,
        site_id=site_id if site_id is not None else jid,
        x=x,
        y=y,
        required_skill=skill,
        priority=priority,
        sla_deadline=sla,
        duration=dur,
        requires_part=requires_part,
        part_available=part_available,
        is_emergency=emergency,
    )


def make_instance(techs, jobs, *, params=None):
    sites = tuple(
        SiteDC(id=j.site_id, name=f"Site {j.site_id}", x=j.x, y=j.y, zone="Z")
        for j in jobs
    )
    return Instance(
        technicians=tuple(techs),
        sites=sites,
        jobs=tuple(jobs),
        skills=SKILLS,
        params=params or Params(),
        # Euclidean grid travel keeps these hand-built instances predictable
        # (the production default is haversine over real lat/long).
        travel_provider=make_euclidean_provider(1.0),
    )
