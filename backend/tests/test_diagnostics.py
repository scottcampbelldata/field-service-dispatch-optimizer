from backend.optimizer.baseline import plan_baseline
from backend.optimizer.domain import UNASSIGNED_NO_PART
from backend.optimizer.metrics import plan_diagnostics
from backend.tests.conftest import ELEC, HVAC, make_instance, make_job, make_tech


def test_diagnostics_skill_demand_and_parts():
    techs = [make_tech(1, 0, 0, {HVAC})]
    jobs = [
        make_job(10, 0, 0, HVAC, dur=60),
        make_job(11, 0, 0, HVAC, dur=60, requires_part=True, part_available=False),
        make_job(12, 0, 0, ELEC, dur=60),  # no electrician -> unassigned no_skill
    ]
    inst = make_instance(techs, jobs)
    plan = plan_baseline(inst)
    d = plan_diagnostics(inst, plan)

    assert d["parts_blocked"] == 1
    # Reasons present and counted.
    reasons = {r["reason"]: r["count"] for r in d["unassigned_by_reason"]}
    assert reasons.get(UNASSIGNED_NO_PART) == 1

    hvac = next(s for s in d["skill_demand"] if s["skill"] == "HVAC")
    assert hvac["jobs"] == 2 and hvac["certified_techs"] == 1
    elec = next(s for s in d["skill_demand"] if s["skill"] == "Electrical")
    assert elec["certified_techs"] == 0 and elec["unassigned"] == 1


def test_diagnostics_bottleneck_is_skill_with_most_pain():
    techs = [make_tech(1, 0, 0, {HVAC})]
    jobs = [make_job(20 + i, 0, 0, ELEC) for i in range(3)]  # all unassignable
    inst = make_instance(techs, jobs)
    d = plan_diagnostics(inst, plan_baseline(inst))
    assert d["bottleneck_skill"] == "Electrical"


def test_diagnostics_capacity_totals():
    techs = [make_tech(1, 0, 0, {HVAC}, shift=(480, 1020))]  # 540 min
    jobs = [make_job(10, 0, 0, HVAC, dur=60)]
    d = plan_diagnostics(make_instance(techs, jobs), plan_baseline(make_instance(techs, jobs)))
    assert d["total_capacity_minutes"] == 540
    assert d["total_demand_minutes"] == 60
