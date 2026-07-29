"""Tests for the greedy + 2-opt baseline.

The point of this planner is to be a *fair* foil, so the tests check that it
obeys exactly the same feasibility rules as the naive baseline and CP-SAT, and
that its improvement pass actually improves.
"""

from __future__ import annotations

from backend.app.generator import build_base_instance
from backend.optimizer.baseline import plan_baseline
from backend.optimizer.domain import (
    UNASSIGNED_NO_PART,
    UNASSIGNED_NO_SKILL,
)
from backend.optimizer.greedy_2opt import plan_greedy_2opt
from backend.optimizer.metrics import compute_objective, plan_metrics
from backend.tests.conftest import ELEC, HVAC, make_instance, make_job, make_tech


def test_unassigned_no_skill():
    inst = make_instance([make_tech(1, 0, 0, {HVAC})], [make_job(10, 5, 5, ELEC)])
    a = plan_greedy_2opt(inst).assignments[0]
    assert not a.assigned and a.reason == UNASSIGNED_NO_SKILL


def test_unassigned_no_part():
    inst = make_instance(
        [make_tech(1, 0, 0, {HVAC})],
        [make_job(10, 5, 5, HVAC, requires_part=True, part_available=False)],
    )
    assert plan_greedy_2opt(inst).assignments[0].reason == UNASSIGNED_NO_PART


def test_never_exceeds_overtime_horizon():
    """shift_end 1020 + cap 120 => nothing may end after 1140."""
    tech = make_tech(1, 0, 0, {HVAC}, shift=(480, 1020), ot_cap=120)
    jobs = [make_job(10 + i, i, 0, HVAC, dur=120, sla=1140) for i in range(12)]
    plan = plan_greedy_2opt(make_instance([tech], jobs))
    for a in plan.assigned():
        assert a.end <= 1140


def test_respects_travel_between_consecutive_jobs():
    tech = make_tech(1, 0, 0, {HVAC})
    jobs = [make_job(10, 0, 0, HVAC, dur=60), make_job(11, 30, 0, HVAC, dur=60)]
    inst = make_instance([tech], jobs)
    plan = plan_greedy_2opt(inst)
    route = plan.for_tech(1)
    for prev, cur in zip(route, route[1:]):
        leg = inst.travel(
            inst.job(prev.job_id).x, inst.job(prev.job_id).y,
            inst.job(cur.job_id).x, inst.job(cur.job_id).y,
        )
        assert cur.start >= prev.end + leg


def test_covers_every_job_exactly_once():
    inst = build_base_instance(seed=7, n_techs=6, n_sites=15, n_jobs=40)
    plan = plan_greedy_2opt(inst)
    ids = [a.job_id for a in plan.assignments]
    assert sorted(ids) == sorted(j.id for j in inst.jobs)


def test_two_opt_fixes_a_zigzag_route():
    """Corners of a square. Priority order sends the naive baseline across the
    diagonal twice (home -> A -> B -> C -> home = 48 minutes); the 2-opt pass
    should reverse the tail into home -> A -> C -> B -> home = 40."""
    tech = make_tech(1, 0, 0, {HVAC})
    jobs = [
        make_job(10, 10, 0, HVAC, priority=1, dur=30, sla=1140),   # A
        make_job(11, 0, 10, HVAC, priority=2, dur=30, sla=1140),   # B
        make_job(12, 10, 10, HVAC, priority=3, dur=30, sla=1140),  # C
    ]
    inst = make_instance([tech], jobs)
    naive = plan_metrics(inst, plan_baseline(inst))
    improved = plan_metrics(inst, plan_greedy_2opt(inst))
    assert improved["jobs_completed"] == naive["jobs_completed"]
    assert improved["travel_minutes"] < naive["travel_minutes"]


def test_beats_naive_baseline_on_the_canonical_day():
    """The whole reason this module exists: the naive foil is beatable in
    milliseconds of pure Python, so it cannot carry a headline claim."""
    inst = build_base_instance()
    naive = plan_baseline(inst)
    improved = plan_greedy_2opt(inst)
    assert compute_objective(inst, improved) > compute_objective(inst, naive)

    nm, im = plan_metrics(inst, naive), plan_metrics(inst, improved)
    assert im["sla_breaches"] < nm["sla_breaches"]
    assert im["overtime_hours"] < nm["overtime_hours"]
    assert im["jobs_completed"] >= nm["jobs_completed"]


def test_is_fast_enough_to_be_a_credible_baseline():
    inst = build_base_instance()
    assert plan_greedy_2opt(inst).solve_seconds < 2.0
