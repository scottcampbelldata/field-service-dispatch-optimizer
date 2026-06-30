from backend.app.generator import DEFAULT_JOBS, DEFAULT_TECHS, build_base_instance


def test_determinism_same_seed():
    a = build_base_instance(seed=7)
    b = build_base_instance(seed=7)
    assert a.technicians == b.technicians
    assert a.jobs == b.jobs
    assert a.sites == b.sites


def test_different_seeds_differ():
    a = build_base_instance(seed=1)
    b = build_base_instance(seed=2)
    assert a.jobs != b.jobs


def test_counts():
    inst = build_base_instance()
    assert len(inst.technicians) == DEFAULT_TECHS
    assert len(inst.jobs) == DEFAULT_JOBS
    assert len(inst.skills) == 6


def test_every_required_skill_is_covered():
    inst = build_base_instance()
    for job in inst.jobs:
        assert inst.certified_techs(job.required_skill), (
            f"job {job.id} needs uncovered skill {job.required_skill}"
        )


def test_every_skill_has_two_techs():
    inst = build_base_instance()
    for skill in inst.skills:
        assert len(inst.certified_techs(skill.id)) >= 2


def test_coordinates_within_metro_bbox():
    from backend.app.generator import LAT_MAX, LAT_MIN, LON_MAX, LON_MIN

    inst = build_base_instance()
    for s in inst.sites:
        assert LON_MIN <= s.x <= LON_MAX, f"site {s.id} lon out of range"
        assert LAT_MIN <= s.y <= LAT_MAX, f"site {s.id} lat out of range"
    for t in inst.technicians:
        assert LON_MIN <= t.home_x <= LON_MAX
        assert LAT_MIN <= t.home_y <= LAT_MAX
