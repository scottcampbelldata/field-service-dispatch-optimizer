from backend.optimizer.transform import transform
from backend.tests.conftest import ELEC, HVAC, make_instance, make_job, make_tech


def _base():
    techs = [
        make_tech(1, 0, 0, {HVAC, ELEC}),
        make_tech(2, 10, 10, {HVAC}),
        make_tech(3, 20, 20, {HVAC}),
    ]
    jobs = [make_job(j, j, j, HVAC) for j in range(10, 20)]
    return make_instance(techs, jobs)


def test_technician_count_subsets():
    out = transform(_base(), technician_count=2)
    assert len(out.technicians) == 2


def test_job_count_scales():
    out = transform(_base(), job_count=4)
    assert len(out.jobs) == 4


def test_skill_shortage_keeps_only_one_certified():
    out = transform(_base(), skill_shortage="HVAC")
    certified = [t for t in out.technicians if HVAC in t.skills]
    assert len(certified) == 1


def test_strict_raises_sla_weight():
    base_w = transform(_base(), sla_strictness="normal").params.w_sla
    strict_w = transform(_base(), sla_strictness="strict").params.w_sla
    assert strict_w >= base_w
    assert transform(_base(), sla_strictness="strict").params.sla_strictness == "strict"


def test_traffic_penalty_sets_multiplier():
    out = transform(_base(), traffic_penalty=2.5)
    assert out.params.traffic_multiplier == 2.5


def test_emergency_injection_flags_jobs():
    out = transform(_base(), emergency_rate=0.5)
    assert any(j.is_emergency and j.priority == 1 for j in out.jobs)


def test_min_travel_goal_raises_travel_weight():
    out = transform(_base(), optimization_goal="min_travel")
    assert out.params.w_travel > transform(_base(), optimization_goal="balanced").params.w_travel
