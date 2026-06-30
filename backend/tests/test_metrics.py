from backend.optimizer.domain import ASSIGNED, Assignment, Plan
from backend.optimizer.metrics import compare, plan_metrics
from backend.tests.conftest import HVAC, make_instance, make_job, make_tech


def _plan(assignments):
    return Plan("test", tuple(assignments), 0.1, "ok", 0.0)


def test_counts_and_bottleneck():
    tech = make_tech(1, 0, 0, {HVAC})
    jobs = [
        make_job(10, 0, 0, HVAC, priority=1),
        make_job(11, 0, 0, HVAC, priority=1),
    ]
    inst = make_instance([tech], jobs)
    assignments = [
        Assignment(10, 1, 0, 480, 540, False, False, ASSIGNED),       # done, on time
        Assignment(11, None, 0, None, None, False, False, "unassigned_capacity"),
    ]
    m = plan_metrics(inst, _plan(assignments))
    assert m["jobs_completed"] == 1
    assert m["unassigned"] == 1
    assert m["jobs_total"] == 2
    assert m["high_priority_protected_rate"] == 50.0
    assert m["bottleneck_skill"] == "HVAC"


def test_travel_and_overtime_hours():
    tech = make_tech(1, 0, 0, {HVAC}, shift=(480, 1020))
    job = make_job(10, 0, 60, HVAC, dur=60)  # 60 units away => 60 min each way
    inst = make_instance([tech], [job])
    # ends at 1080 => 60 minutes overtime past shift_end 1020.
    a = Assignment(10, 1, 0, 1020, 1080, False, True, ASSIGNED)
    m = plan_metrics(inst, _plan([a]))
    assert m["travel_hours"] == 2.0       # 60 there + 60 back
    assert m["overtime_hours"] == 1.0


def test_compare_deltas():
    base = {"jobs_completed": 84, "sla_breaches": 17, "travel_hours": 41.2,
            "overtime_hours": 9.5, "unassigned": 20, "objective": 1000}
    opt = {"jobs_completed": 91, "sla_breaches": 6, "travel_hours": 32.7,
           "overtime_hours": 4.0, "unassigned": 13, "objective": 1500}
    d = compare(base, opt)
    assert d["jobs_completed_delta"] == 7
    assert d["sla_breaches_delta"] == -11
    assert d["travel_hours_delta"] == -8.5
    assert d["objective_delta"] == 500
