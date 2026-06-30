from backend.optimizer.baseline import plan_baseline
from backend.optimizer.cp_sat_model import plan_optimized
from backend.optimizer.domain import Params
from backend.optimizer.metrics import compute_objective
from backend.tests.conftest import ELEC, HVAC, make_instance, make_job, make_tech


def _small_instance(params=None):
    techs = [
        make_tech(1, 0, 0, {HVAC}),
        make_tech(2, 50, 50, {HVAC, ELEC}),
    ]
    jobs = [
        make_job(10, 5, 5, HVAC, priority=1, dur=60),
        make_job(11, 52, 52, ELEC, priority=2, dur=60),
        make_job(12, 10, 10, HVAC, priority=3, dur=60),
    ]
    return make_instance(techs, jobs, params=params)


def test_returns_feasible_plan():
    plan = plan_optimized(_small_instance(), max_seconds=5)
    assert plan.status in ("OPTIMAL", "FEASIBLE")
    assert len(plan.assigned()) >= 1


def test_respects_skills():
    plan = plan_optimized(_small_instance(), max_seconds=5)
    inst = _small_instance()
    for a in plan.assigned():
        job = inst.job(a.job_id)
        assert inst.tech(a.tech_id).has_skill(job.required_skill)


def test_optimized_beats_or_matches_baseline():
    inst = _small_instance()
    opt = plan_optimized(inst, max_seconds=5)
    base = plan_baseline(inst)
    assert compute_objective(inst, opt) >= compute_objective(inst, base)


def test_overtime_disabled_means_no_overtime():
    # One tech, short shift, no OT; jobs that would require OT must be dropped.
    params = Params(overtime_allowed=False)
    techs = [make_tech(1, 0, 0, {HVAC}, shift=(480, 660), ot=False)]  # 3h
    jobs = [
        make_job(10, 0, 0, HVAC, dur=90, priority=1),
        make_job(11, 0, 0, HVAC, dur=90, priority=1),
        make_job(12, 0, 0, HVAC, dur=90, priority=1),
    ]
    inst = make_instance(techs, jobs, params=params)
    plan = plan_optimized(inst, max_seconds=5)
    for a in plan.assigned():
        assert not a.is_overtime
        assert a.end <= techs[0].shift_end


def test_solver_respects_time_bound():
    plan = plan_optimized(_small_instance(), max_seconds=2)
    assert plan.solve_seconds < 10  # generous ceiling over the 2s bound
