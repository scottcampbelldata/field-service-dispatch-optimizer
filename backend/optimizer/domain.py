"""Pure-Python domain model for the dispatch optimizer.

These dataclasses are the *only* interface between the data layer and the
optimization engine. The engine (baseline + CP-SAT) imports nothing else from
the project, so it can be unit-tested with no database.

Time is represented as integer minutes from the start of the operating day
(e.g. 480 == 08:00, 1020 == 17:00). Coordinates live on an abstract grid;
travel time is derived from Euclidean distance (see ``travel.py``).
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Optional

from .travel import haversine_minutes

# Reason codes attached to every job after planning.
ASSIGNED = "assigned"
UNASSIGNED_NO_SKILL = "unassigned_no_skill"
UNASSIGNED_NO_PART = "unassigned_no_part"
UNASSIGNED_SHIFT = "unassigned_shift"          # baseline: could not fit in any route
UNASSIGNED_CAPACITY = "unassigned_capacity"    # optimizer: dropped on purpose


@dataclass(frozen=True)
class Skill:
    id: int
    name: str


@dataclass(frozen=True)
class TechnicianDC:
    id: int
    name: str
    home_x: float
    home_y: float
    shift_start: int
    shift_end: int
    overtime_eligible: bool
    overtime_cap: int            # max minutes beyond shift_end when OT is allowed
    skills: frozenset[int]       # skill ids this technician is certified in

    def has_skill(self, skill_id: int) -> bool:
        return skill_id in self.skills


@dataclass(frozen=True)
class SiteDC:
    id: int
    name: str
    x: float
    y: float
    zone: str


@dataclass(frozen=True)
class JobDC:
    id: int
    site_id: int
    x: float                     # denormalized site coords (for travel)
    y: float
    required_skill: int
    priority: int                # 1 = highest .. 4 = lowest
    sla_deadline: int            # minutes from day start by which job must finish
    duration: int                # service minutes
    requires_part: bool
    part_available: bool
    is_emergency: bool

    @property
    def part_blocked(self) -> bool:
        return self.requires_part and not self.part_available


@dataclass(frozen=True)
class Params:
    """Solver-ready parameters. The user-facing slider knobs are translated
    into these concrete values by ``transform.transform``."""
    speed_factor: float = 1.0          # minutes of travel per grid unit
    traffic_multiplier: float = 1.0    # >= 1.0; scales travel time
    overtime_allowed: bool = True
    sla_strictness: str = "normal"     # 'lenient' | 'normal' | 'strict'
    optimization_goal: str = "balanced"
    max_solve_seconds: float = 8.0
    # objective weights (all integer so CP-SAT stays integral). Completion is
    # rewarded (weighted by priority) and travel/SLA/overtime are penalized.
    # Throughput is protected separately by a hard "complete at least as many as
    # the baseline" constraint in the model, so these weights are free to drive
    # quality (fewer breaches, less travel/overtime) above that floor.
    w_completed: int = 300             # base reward per completed job
    w_travel: int = 1                  # penalty per travel minute
    w_sla: int = 250                   # penalty per SLA breach
    w_overtime: int = 3                # penalty per overtime minute

    def priority_reward(self, priority: int) -> int:
        """Higher reward for higher priority (priority 1 is most important)."""
        return self.w_completed * (5 - priority)


@dataclass(frozen=True)
class Instance:
    technicians: tuple[TechnicianDC, ...]
    sites: tuple[SiteDC, ...]
    jobs: tuple[JobDC, ...]
    skills: tuple[Skill, ...]
    params: Params = field(default_factory=Params)
    # Pluggable base-travel provider (lon, lat, lon, lat) -> base minutes.
    # None => great-circle haversine using params.speed_factor. A real
    # road-routing provider is injected by the I/O layer. Excluded from
    # equality/repr so instances stay comparable in tests.
    travel_provider: Optional[object] = field(default=None, compare=False, repr=False)

    def base_travel(self, ax: float, ay: float, bx: float, by: float) -> int:
        """One-way travel minutes without the traffic multiplier."""
        if self.travel_provider is not None:
            return self.travel_provider(ax, ay, bx, by)
        return haversine_minutes(ax, ay, bx, by, self.params.speed_factor)

    def travel(self, ax: float, ay: float, bx: float, by: float) -> int:
        """Effective one-way travel minutes including the traffic multiplier."""
        return int(round(self.base_travel(ax, ay, bx, by) * self.params.traffic_multiplier))

    def tech(self, tech_id: int) -> TechnicianDC:
        return self._tech_index[tech_id]

    def job(self, job_id: int) -> JobDC:
        return self._job_index[job_id]

    def site(self, site_id: int) -> SiteDC:
        return self._site_index[site_id]

    def skill_name(self, skill_id: int) -> str:
        return self._skill_index[skill_id].name

    def with_params(self, params: Params) -> "Instance":
        return replace(self, params=params)

    # --- cached lookups -------------------------------------------------
    @property
    def _tech_index(self) -> dict[int, TechnicianDC]:
        return {t.id: t for t in self.technicians}

    @property
    def _job_index(self) -> dict[int, JobDC]:
        return {j.id: j for j in self.jobs}

    @property
    def _site_index(self) -> dict[int, SiteDC]:
        return {s.id: s for s in self.sites}

    @property
    def _skill_index(self) -> dict[int, Skill]:
        return {s.id: s for s in self.skills}

    def certified_techs(self, skill_id: int) -> list[TechnicianDC]:
        return [t for t in self.technicians if t.has_skill(skill_id)]


@dataclass(frozen=True)
class Assignment:
    job_id: int
    tech_id: Optional[int]       # None == unassigned
    seq: int                     # order within the technician's route (0-based)
    start: Optional[int]         # planned start minute (None if unassigned)
    end: Optional[int]           # planned end minute (None if unassigned)
    is_sla_breach: bool
    is_overtime: bool
    reason: str

    @property
    def assigned(self) -> bool:
        return self.tech_id is not None


@dataclass(frozen=True)
class Plan:
    plan_type: str               # 'baseline' | 'optimized'
    assignments: tuple[Assignment, ...]
    solve_seconds: float
    status: str
    objective: float
    # Relative gap to CP-SAT's proven objective bound, as a percentage
    # (0.0 == proven optimal). None when not applicable (baseline / no solver).
    optimality_gap: Optional[float] = None

    def assigned(self) -> list[Assignment]:
        return [a for a in self.assignments if a.assigned]

    def unassigned(self) -> list[Assignment]:
        return [a for a in self.assignments if not a.assigned]

    def for_tech(self, tech_id: int) -> list[Assignment]:
        return sorted(
            (a for a in self.assignments if a.tech_id == tech_id),
            key=lambda a: a.seq,
        )


def static_unassigned_reason(instance: Instance, job: JobDC) -> Optional[str]:
    """Reason a job is *intrinsically* unassignable, independent of routing.

    Shared by baseline and optimizer so unassigned reasons are consistent.
    Returns None when the job is at least theoretically assignable.
    """
    if job.part_blocked:
        return UNASSIGNED_NO_PART
    if not instance.certified_techs(job.required_skill):
        return UNASSIGNED_NO_SKILL
    return None
