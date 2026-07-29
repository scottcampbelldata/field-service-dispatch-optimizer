"""Does a longer solve budget close the gap to the 2-opt baseline?

``seed_sweep`` runs CP-SAT at the product's default 8-second budget and finds it
loses to ``greedy_2opt`` on most seeds. That could mean two very different
things:

* the model is fine and 8 seconds is simply not enough, or
* the formulation (candidate capping, per-technician circuits) is the limit and
  more time will not help.

This runs the same scenarios at several budgets and reports how the gap moves.
The answer changes what the fix is, so it is worth the wall time.

    python -m backend.experiments.budget_scaling --seeds 24 --budgets 2,8,30,60
"""

from __future__ import annotations

import argparse
import csv
import random
import statistics
import sys
import time
from pathlib import Path

from backend.experiments.seed_sweep import build_instance, sample_scenario, validate
from backend.optimizer.baseline import plan_baseline
from backend.optimizer.cp_sat_model import plan_optimized
from backend.optimizer.greedy_2opt import plan_greedy_2opt
from backend.optimizer.metrics import plan_metrics


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--seeds", type=int, default=24)
    ap.add_argument("--start-seed", type=int, default=1000)
    ap.add_argument("--budgets", default="2,8,30,60")
    ap.add_argument("--out", default="backend/experiments/results/budget_scaling.csv")
    args = ap.parse_args(argv)

    budgets = [float(b) for b in args.budgets.split(",")]
    # Same scenario stream as seed_sweep, so these are a subset of those days.
    scen_rng = random.Random(20260728)
    scenarios = [(args.start_seed + i, sample_scenario(scen_rng)) for i in range(args.seeds)]

    rows: list[dict] = []
    t0 = time.perf_counter()
    for seed, scen in scenarios:
        inst = build_instance(seed, scen, budgets[0])
        naive = plan_baseline(inst)
        g2 = plan_greedy_2opt(inst)
        validate(inst, g2)
        gm = plan_metrics(inst, g2)
        nm = plan_metrics(inst, naive)

        for b in budgets:
            opt = plan_optimized(inst, max_seconds=b, warm_start=naive)
            validate(inst, opt)
            om = plan_metrics(inst, opt)
            rows.append({
                "seed": seed,
                "budget": b,
                "naive_sla_breaches": nm["sla_breaches"],
                "greedy2opt_sla_breaches": gm["sla_breaches"],
                "cpsat_sla_breaches": om["sla_breaches"],
                "naive_overtime_hours": nm["overtime_hours"],
                "greedy2opt_overtime_hours": gm["overtime_hours"],
                "cpsat_overtime_hours": om["overtime_hours"],
                "greedy2opt_objective": gm["objective"],
                "cpsat_objective": om["objective"],
                "cpsat_status": om["status"],
                "cpsat_solve_seconds": om["solve_seconds"],
            })
        print(f"  seed {seed} done ({time.perf_counter() - t0:.0f}s)", file=sys.stderr, flush=True)

    wall = time.perf_counter() - t0
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    print(f"\nn={args.seeds} seeds  budgets={budgets}  wall={wall:.1f}s  raw: {out}")
    print(f"\n{'budget':>8}{'d_breach_vs_2opt':>19}{'d_OT_vs_2opt':>15}"
          f"{'cpsat<2opt obj':>17}{'median solve s':>16}")
    for b in budgets:
        sub = [r for r in rows if r["budget"] == b]
        db = [r["cpsat_sla_breaches"] - r["greedy2opt_sla_breaches"] for r in sub]
        do = [r["cpsat_overtime_hours"] - r["greedy2opt_overtime_hours"] for r in sub]
        lose = sum(1 for r in sub if r["cpsat_objective"] < r["greedy2opt_objective"])
        ss = [r["cpsat_solve_seconds"] for r in sub]
        print(
            f"{b:>8.0f}{statistics.median(db):>19.1f}{statistics.median(do):>15.2f}"
            f"{f'{lose}/{len(sub)}':>17}{statistics.median(ss):>16.2f}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
