from backend.optimizer.cost import CostRates, cost_impact, plan_cost

RATES = CostRates(sla_breach=250, overtime_hour=60, travel_hour=40, unassigned_job=120)


def test_plan_cost_breakdown():
    m = {"sla_breaches": 10, "overtime_hours": 5.0, "travel_hours": 20.0, "unassigned": 8}
    c = plan_cost(m, RATES)
    assert c["sla"] == 2500
    assert c["overtime"] == 300
    assert c["travel"] == 800
    assert c["unassigned"] == 960
    assert c["total"] == 2500 + 300 + 800 + 960


def test_cost_impact_savings():
    base = {"sla_breaches": 17, "overtime_hours": 9.5, "travel_hours": 41.2, "unassigned": 20}
    opt = {"sla_breaches": 6, "overtime_hours": 4.0, "travel_hours": 32.7, "unassigned": 13}
    impact = cost_impact(base, opt, RATES, work_days=260)
    assert impact["savings_per_day"] == impact["baseline"]["total"] - impact["optimized"]["total"]
    assert impact["savings_per_day"] > 0
    assert impact["savings_per_year"] == impact["savings_per_day"] * 260
    assert impact["rates"]["sla_breach"] == 250
