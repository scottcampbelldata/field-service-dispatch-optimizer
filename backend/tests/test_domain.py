import pytest

from backend.optimizer.domain import (
    UNASSIGNED_NO_PART,
    UNASSIGNED_NO_SKILL,
    static_unassigned_reason,
)
from backend.tests.conftest import ELEC, HVAC, make_instance, make_job, make_tech


def test_lookups():
    inst = make_instance(
        [make_tech(1, 0, 0, {HVAC})],
        [make_job(10, 5, 5, HVAC)],
    )
    assert inst.tech(1).name == "Tech 1"
    assert inst.job(10).required_skill == HVAC
    assert inst.skill_name(HVAC) == "HVAC"
    assert inst.certified_techs(HVAC) and not inst.certified_techs(ELEC)


def test_instance_is_immutable():
    inst = make_instance([make_tech(1, 0, 0, {HVAC})], [make_job(10, 5, 5, HVAC)])
    with pytest.raises(Exception):
        inst.jobs = ()


def test_static_reason_no_skill():
    inst = make_instance(
        [make_tech(1, 0, 0, {HVAC})],
        [make_job(10, 5, 5, ELEC)],  # no electrician on staff
    )
    assert static_unassigned_reason(inst, inst.job(10)) == UNASSIGNED_NO_SKILL


def test_static_reason_no_part():
    inst = make_instance(
        [make_tech(1, 0, 0, {HVAC})],
        [make_job(10, 5, 5, HVAC, requires_part=True, part_available=False)],
    )
    assert static_unassigned_reason(inst, inst.job(10)) == UNASSIGNED_NO_PART


def test_static_reason_none_when_feasible():
    inst = make_instance([make_tech(1, 0, 0, {HVAC})], [make_job(10, 5, 5, HVAC)])
    assert static_unassigned_reason(inst, inst.job(10)) is None
