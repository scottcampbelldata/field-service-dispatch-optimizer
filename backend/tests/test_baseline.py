from backend.optimizer.baseline import plan_baseline
from backend.optimizer.domain import (
    UNASSIGNED_NO_PART,
    UNASSIGNED_NO_SKILL,
)
from backend.tests.conftest import ELEC, HVAC, make_instance, make_job, make_tech


def test_unassigned_no_skill():
    inst = make_instance(
        [make_tech(1, 0, 0, {HVAC})],
        [make_job(10, 5, 5, ELEC)],
    )
    plan = plan_baseline(inst)
    a = plan.assignments[0]
    assert not a.assigned and a.reason == UNASSIGNED_NO_SKILL


def test_unassigned_no_part():
    inst = make_instance(
        [make_tech(1, 0, 0, {HVAC})],
        [make_job(10, 5, 5, HVAC, requires_part=True, part_available=False)],
    )
    plan = plan_baseline(inst)
    assert plan.assignments[0].reason == UNASSIGNED_NO_PART


def test_assigns_to_nearest_qualified_tech():
    far = make_tech(1, 100, 100, {HVAC})
    near = make_tech(2, 5, 5, {HVAC})
    job = make_job(10, 6, 6, HVAC)
    plan = plan_baseline(make_instance([far, near], [job]))
    assigned = plan.assigned()
    assert len(assigned) == 1 and assigned[0].tech_id == 2


def test_respects_shift_bounds():
    # Single tech, two long jobs that cannot both fit before shift end + OT.
    tech = make_tech(1, 0, 0, {HVAC}, shift=(480, 600), ot=False)  # 2h window
    jobs = [
        make_job(10, 0, 0, HVAC, dur=90, priority=1),
        make_job(11, 0, 0, HVAC, dur=90, priority=2),
    ]
    plan = plan_baseline(make_instance([tech], jobs))
    for a in plan.assigned():
        assert a.end <= tech.shift_end
    assert len(plan.assigned()) == 1  # only one fits


def test_sla_breach_flagged():
    tech = make_tech(1, 0, 0, {HVAC}, shift=(480, 1020))
    job = make_job(10, 0, 0, HVAC, dur=60, sla=500)  # deadline before it can finish
    plan = plan_baseline(make_instance([tech], [job]))
    a = plan.assigned()[0]
    assert a.is_sla_breach
