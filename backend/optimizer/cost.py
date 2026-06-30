"""Cost ($) impact model.

Translates operational metrics (SLA breaches, overtime, travel, unfinished work)
into dollars so the optimizer's advantage can be stated as ROI. Rates are
configurable; defaults are illustrative, round figures for a commercial
field-service operation. Pure functions — no DB, no I/O.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CostRates:
    sla_breach: float = 250.0       # $ penalty per SLA breach
    overtime_hour: float = 60.0     # $ per overtime hour (premium labor)
    travel_hour: float = 40.0       # $ per travel hour (fuel + wages)
    unassigned_job: float = 120.0   # $ opportunity cost per unfinished job


def plan_cost(metrics: dict, rates: CostRates) -> dict:
    """Daily cost breakdown for a single plan's metrics."""
    sla = metrics["sla_breaches"] * rates.sla_breach
    overtime = metrics["overtime_hours"] * rates.overtime_hour
    travel = metrics["travel_hours"] * rates.travel_hour
    unassigned = metrics["unassigned"] * rates.unassigned_job
    total = sla + overtime + travel + unassigned
    return {
        "sla": round(sla),
        "overtime": round(overtime),
        "travel": round(travel),
        "unassigned": round(unassigned),
        "total": round(total),
    }


def cost_impact(baseline_metrics: dict, optimized_metrics: dict,
                rates: CostRates, work_days: int = 260) -> dict:
    """Baseline vs optimized daily cost, plus annualized savings."""
    b = plan_cost(baseline_metrics, rates)
    o = plan_cost(optimized_metrics, rates)
    savings_per_day = b["total"] - o["total"]
    return {
        "baseline": b,
        "optimized": o,
        "savings_per_day": savings_per_day,
        "savings_per_year": savings_per_day * work_days,
        "rates": {
            "sla_breach": rates.sla_breach,
            "overtime_hour": rates.overtime_hour,
            "travel_hour": rates.travel_hour,
            "unassigned_job": rates.unassigned_job,
        },
    }
