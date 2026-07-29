"""Post-hoc analysis of a seed_sweep.csv.

Answers three questions the summary table in ``seed_sweep`` does not:

1. **Is "optimized beats baseline" a measurement or a tautology?** Counts seeds
   where the CP-SAT objective falls below its own warm start. Because
   ``plan_optimized`` hints the warm start and falls back to it when the
   incumbent scores worse, the answer should be exactly zero — which is the
   point. A comparison that cannot produce a negative is not evidence.

2. **How does the margin move with the generator knobs?** Tercile medians for
   each knob, which are readable in a way Spearman rho is not.

3. **What does the headline actually reduce to?** The quotable median and
   5th-95th band, against both baselines.

    python -m backend.experiments.analyze backend/experiments/results/seed_sweep.csv
"""

from __future__ import annotations

import csv
import statistics
import sys

from backend.experiments.seed_sweep import pct, spearman

KNOBS = [
    "n_techs", "n_jobs", "skill_mix", "emergency_rate",
    "speed_factor", "traffic_penalty", "load_ratio",
]


def load(path: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    for r in rows:
        for k, v in list(r.items()):
            if k.endswith("_status"):
                continue
            try:
                r[k] = float(v)
            except (TypeError, ValueError):
                pass
    return rows


def band(vals: list[float]) -> str:
    return (
        f"median {statistics.median(vals):+.1f}   "
        f"p5..p95 {pct(vals, 5):+.1f} .. {pct(vals, 95):+.1f}   "
        f"mean {statistics.fmean(vals):+.1f}"
    )


def main(argv: list[str]) -> int:
    path = argv[1] if len(argv) > 1 else "backend/experiments/results/seed_sweep.csv"
    rows = load(path)
    n = len(rows)
    print(f"n = {n} seeds   source = {path}\n")

    print("== 1. is the warm-started comparison capable of a negative? ==")
    for arm, ref in (("cpsat", "naive"), ("cpsat_ws2opt", "greedy2opt")):
        worse = sum(1 for r in rows if r[f"{arm}_objective"] < r[f"{ref}_objective"])
        equal = sum(1 for r in rows if r[f"{arm}_objective"] == r[f"{ref}_objective"])
        print(
            f"  {arm} objective < its own warm start ({ref}): {worse}/{n} seeds"
            f"   (identical to warm start: {equal}/{n})"
        )
    cross = sum(1 for r in rows if r["cpsat_objective"] < r["greedy2opt_objective"])
    print(
        f"  cpsat objective < greedy2opt (a baseline it was NOT warm-started from): "
        f"{cross}/{n} seeds"
    )

    print("\n== 2. headline candidates ==")
    pairs = [
        ("SLA breaches, cpsat vs naive      ", "d_cpsat_vs_naive_sla_breaches"),
        ("SLA breaches, cpsat vs greedy2opt ", "d_cpsat_vs_greedy2opt_sla_breaches"),
        ("SLA breaches, greedy2opt vs naive ", "d_greedy2opt_vs_naive_sla_breaches"),
        ("Overtime hrs, cpsat vs naive      ", "d_cpsat_vs_naive_overtime_hours"),
        ("Overtime hrs, cpsat vs greedy2opt ", "d_cpsat_vs_greedy2opt_overtime_hours"),
        ("Overtime hrs, greedy2opt vs naive ", "d_greedy2opt_vs_naive_overtime_hours"),
        ("Jobs done,    cpsat vs greedy2opt ", "d_cpsat_vs_greedy2opt_jobs_completed"),
        ("SLA breaches, ws2opt vs greedy2opt", "d_cpsat_ws2opt_vs_greedy2opt_sla_breaches"),
        ("Overtime hrs, ws2opt vs greedy2opt", "d_cpsat_ws2opt_vs_greedy2opt_overtime_hours"),
        ("Jobs done,    ws2opt vs greedy2opt", "d_cpsat_ws2opt_vs_greedy2opt_jobs_completed"),
    ]
    for label, col in pairs:
        print(f"  {label}  {band([r[col] for r in rows])}")

    print("\n== 3. baseline realism (SLA failure rate among scheduled jobs) ==")
    for arm in ("naive", "greedy2opt", "cpsat", "cpsat_ws2opt"):
        rate = [
            100.0 * r[f"{arm}_sla_breaches"] / max(1.0, r[f"{arm}_jobs_completed"])
            for r in rows
        ]
        print(
            f"  {arm:<14} median {statistics.median(rate):5.1f}%   "
            f"p5..p95 {pct(rate, 5):.1f}% .. {pct(rate, 95):.1f}%"
        )

    print("\n== 4. sensitivity: tercile medians of (cpsat - greedy2opt) ==")
    targets = [
        ("breaches", "d_cpsat_vs_greedy2opt_sla_breaches"),
        ("overtime", "d_cpsat_vs_greedy2opt_overtime_hours"),
    ]
    for knob in KNOBS:
        xs = sorted(rows, key=lambda r: r[knob])
        third = max(1, len(xs) // 3)
        lo, hi = xs[:third], xs[-third:]
        parts = []
        for name, col in targets:
            rho = spearman([r[knob] for r in rows], [r[col] for r in rows])
            parts.append(
                f"{name}: low3rd {statistics.median([r[col] for r in lo]):+.1f} -> "
                f"high3rd {statistics.median([r[col] for r in hi]):+.1f} (rho {rho:+.2f})"
            )
        rng = f"[{xs[0][knob]:g}..{xs[-1][knob]:g}]"
        print(f"  {knob:<16}{rng:<16}{'   |   '.join(parts)}")

    print("\n== 5. wins and losses, cpsat vs greedy2opt ==")
    for k in ("sla_breaches", "overtime_hours", "jobs_completed", "travel_hours"):
        vals = [r[f"d_cpsat_vs_greedy2opt_{k}"] for r in rows]
        neg = sum(1 for v in vals if v < 0)
        zero = sum(1 for v in vals if v == 0)
        pos = sum(1 for v in vals if v > 0)
        better, worse = (pos, neg) if k == "jobs_completed" else (neg, pos)
        print(f"  {k:<16} cpsat better {better:>4}/{n}   tie {zero:>4}   worse {worse:>4}")

    print("\n== 6. solve time actually consumed ==")
    for arm in ("naive", "greedy2opt", "cpsat", "cpsat_ws2opt"):
        ss = [r[f"{arm}_solve_seconds"] for r in rows]
        print(
            f"  {arm:<14} median {statistics.median(ss):7.3f}s   "
            f"max {max(ss):7.3f}s   total {sum(ss):8.1f}s"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
