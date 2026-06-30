from backend.app import sweep_service


def test_tech_counts_evenly_spaced():
    assert sweep_service._tech_counts(4, 12, 5) == [4, 6, 8, 10, 12]
    assert sweep_service._tech_counts(4, 12, 3) == [4, 8, 12]


def test_tech_counts_dedupes_and_clamps():
    # narrow range can't produce more distinct points than integers available
    assert sweep_service._tech_counts(5, 6, 8) == [5, 6]
    # steps clamped to MAX_STEPS
    assert len(sweep_service._tech_counts(1, 50, 99)) <= sweep_service.MAX_STEPS


def test_marginal_value_deltas_and_diminishing():
    series = [
        {"technician_count": 4, "jobs_completed": 50, "sla_breaches": 30},
        {"technician_count": 6, "jobs_completed": 62, "sla_breaches": 22},
        {"technician_count": 8, "jobs_completed": 70, "sla_breaches": 18},
        {"technician_count": 10, "jobs_completed": 70, "sla_breaches": 18},  # flat
    ]
    marginal, diminishing_at = sweep_service.marginal_value(series)
    assert marginal[0] == {"technician_count": 6, "delta_jobs": 12, "delta_breaches": -8}
    assert [m["delta_jobs"] for m in marginal] == [12, 8, 0]
    assert diminishing_at == 10  # first count where added tech gains < 1 job


def test_capacity_sweep_integration_small():
    result = sweep_service.capacity_sweep(
        {"job_count": 30},
        min_techs=4, max_techs=8, steps=2,
        per_point_seconds=1.0, include_overtime_off=False,
    )
    pts = result["points"]
    assert [p["technician_count"] for p in pts] == [4, 8]
    assert all(p["overtime_allowed"] for p in pts)
    for p in pts:
        assert p["jobs_completed"] >= 0 and p["sla_breaches"] >= 0
    # more capacity should not complete fewer jobs
    assert pts[-1]["jobs_completed"] >= pts[0]["jobs_completed"]
    assert isinstance(result["narrative"], str) and result["narrative"]
