"""Randomized seed sweep: how much does CP-SAT actually buy?

The README headline ("18 fewer SLA breaches, 10.5 fewer overtime hours") comes
from a single seed measured against ``baseline.plan_baseline``, which is a
deliberately naive foil that breaches 42% of the jobs it schedules. Two things
make that number untrustworthy:

1. ``plan_optimized`` warm-starts CP-SAT with the naive baseline and falls back
   to it whenever the incumbent is worse, so "optimized beats naive" is true by
   construction. Only the size of the gap is empirical, never the sign.
2. No real dispatcher is that bad. Beating a strawman inflates the number by an
   unknown amount.

This script measures the gap against a baseline that is not a strawman:
``greedy_2opt.plan_greedy_2opt`` (greedy nearest-qualified construction, then
2-opt route improvement and re-insertion, in ~20 ms of pure Python). It runs
four planners over many randomized scenarios and writes every row to CSV so the
distribution, not one cherry-picked day, is what gets quoted.

Arms
----
``naive``         ``baseline.plan_baseline``, the naive baseline.
``greedy2opt``    ``greedy_2opt.plan_greedy_2opt``, the stronger baseline.
``cpsat``         ``plan_optimized`` exactly as the app ships it (warm-started
                  from ``naive``). This is the product's real behaviour.
``cpsat_ws2opt``  ``plan_optimized`` warm-started from ``greedy2opt`` instead,
                  to separate "CP-SAT is good" from "CP-SAT inherited a good
                  incumbent".

Scenario knobs randomized per seed: crew size, job backlog, skill mix (mean
skills per technician), emergency rate, travel scale (minutes per km), and
traffic multiplier.

Usage
-----
    python -m backend.experiments.seed_sweep --seeds 200 --solve-seconds 8
    python -m backend.experiments.seed_sweep --seeds 20 --solve-seconds 2 --out /tmp/quick.csv

Depends only on ``backend.optimizer`` + ``backend.app.generator``. No FastAPI,
no database, no network.
"""

from __future__ import annotations

import argparse
import csv
import math
import random
import statistics
import sys
import time
from dataclasses import replace
from pathlib import Path

from backend.app.generator import build_base_instance
from backend.optimizer.baseline import plan_baseline
from backend.optimizer.cp_sat_model import plan_optimized
from backend.optimizer.greedy_2opt import plan_greedy_2opt
from backend.optimizer.metrics import plan_metrics
from backend.optimizer.transform import transform

ARMS = ("naive", "greedy2opt", "cpsat", "cpsat_ws2opt")

METRIC_KEYS = (
    "jobs_completed",
    "sla_breaches",
    "travel_hours",
    "overtime_hours",
    "unassigned",
    "objective",
    "solve_seconds",
)


# --------------------------------------------------------------------------
# scenario sampling
# --------------------------------------------------------------------------

def sample_scenario(rng: random.Random) -> dict:
    """Draw one randomized operating day."""
    return {
        "n_techs": rng.randint(6, 18),
        "n_jobs": rng.randint(70, 150),
        "n_sites": rng.randint(20, 45),
        # mean skills per technician: 1.0 (hyper-specialized crew) .. 3.5 (generalists)
        "skill_mix": round(rng.uniform(1.0, 3.5), 2),
        "emergency_rate": round(rng.choice([0.0, 0.0, 0.05, 0.10, 0.20, 0.30]), 2),
        # travel scale in minutes per km: 0.8 (~75 km/h) .. 2.2 (~27 km/h)
        "speed_factor": round(rng.uniform(0.8, 2.2), 2),
        "traffic_penalty": round(rng.uniform(1.0, 1.8), 2),
    }


def _retarget_skills(instance, target_mean: float, rng: random.Random):
    """Rewrite each technician's skill set so the crew averages ``target_mean``
    certifications, then guarantee every skill is held by at least one tech.

    The stock generator hardcodes 1-3 skills per technician. Varying it is the
    only way to sweep skill mix, and it is the knob that decides how much
    freedom a router actually has.
    """
    skill_ids = [s.id for s in instance.skills]
    techs = []
    for t in instance.technicians:
        k = int(target_mean)
        if rng.random() < (target_mean - k):
            k += 1
        k = max(1, min(len(skill_ids), k))
        techs.append(replace(t, skills=frozenset(rng.sample(skill_ids, k))))

    covered = set()
    for t in techs:
        covered |= t.skills
    for sid in skill_ids:
        if sid in covered:
            continue
        i = rng.randrange(len(techs))
        techs[i] = replace(techs[i], skills=frozenset(techs[i].skills | {sid}))

    return replace(instance, technicians=tuple(techs))


def build_instance(seed: int, scen: dict, solve_seconds: float):
    base = build_base_instance(
        seed=seed,
        n_techs=scen["n_techs"],
        n_sites=scen["n_sites"],
        n_jobs=scen["n_jobs"],
    )
    base = _retarget_skills(base, scen["skill_mix"], random.Random(seed * 7919 + 13))
    base = replace(base, params=replace(base.params, speed_factor=scen["speed_factor"]))

    inst = transform(
        base,
        traffic_penalty=scen["traffic_penalty"],
        emergency_rate=scen["emergency_rate"],
        max_solve_seconds=solve_seconds,
    )
    # transform() rebuilds Params from scratch and would drop the sampled travel
    # scale, so restore it.
    return replace(inst, params=replace(inst.params, speed_factor=scen["speed_factor"]))


# --------------------------------------------------------------------------
# validation
# --------------------------------------------------------------------------

def validate(instance, plan) -> None:
    """Hard-fail on any plan that cheats. Every reported number depends on all
    four arms obeying identical rules, so this runs on every plan, every seed."""
    jobs = {j.id: j for j in instance.jobs}
    techs = {t.id: t for t in instance.technicians}

    seen = [a.job_id for a in plan.assignments]
    if len(seen) != len(set(seen)):
        raise AssertionError(f"{plan.plan_type}: job appears more than once")
    if set(seen) != set(jobs):
        raise AssertionError(f"{plan.plan_type}: plan does not cover exactly the job set")

    for a in plan.assigned():
        job, tech = jobs[a.job_id], techs[a.tech_id]
        if not tech.has_skill(job.required_skill):
            raise AssertionError(f"{plan.plan_type}: tech {tech.id} lacks skill for job {job.id}")
        if job.part_blocked:
            raise AssertionError(f"{plan.plan_type}: job {job.id} assigned despite missing part")
        if a.end - a.start != job.duration:
            raise AssertionError(f"{plan.plan_type}: job {job.id} duration violated")
        if a.start < tech.shift_start:
            raise AssertionError(f"{plan.plan_type}: job {job.id} starts before shift")
        cap = tech.overtime_cap if (instance.params.overtime_allowed and tech.overtime_eligible) else 0
        if a.end > tech.shift_end + cap:
            raise AssertionError(f"{plan.plan_type}: job {job.id} ends past horizon")

    # No technician may be in two places at once, and travel must be respected.
    for tech in instance.technicians:
        route = plan.for_tech(tech.id)
        px, py = tech.home_x, tech.home_y
        clock = tech.shift_start
        for a in route:
            job = jobs[a.job_id]
            leg = instance.travel(px, py, job.x, job.y)
            if a.start < clock + leg:
                raise AssertionError(
                    f"{plan.plan_type}: tech {tech.id} job {job.id} starts before travel completes"
                )
            clock = a.end
            px, py = job.x, job.y


# --------------------------------------------------------------------------
# stats helpers (pure python; no numpy/scipy dependency)
# --------------------------------------------------------------------------

def pct(values: list[float], q: float) -> float:
    """Linear-interpolated percentile, q in [0, 100]."""
    if not values:
        return float("nan")
    s = sorted(values)
    if len(s) == 1:
        return s[0]
    pos = (len(s) - 1) * q / 100.0
    lo = math.floor(pos)
    hi = math.ceil(pos)
    if lo == hi:
        return s[int(pos)]
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def _ranks(xs: list[float]) -> list[float]:
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    ranks = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        avg = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    return ranks


def spearman(xs: list[float], ys: list[float]) -> float:
    """Spearman rank correlation. Returns nan when either series is constant."""
    rx, ry = _ranks(xs), _ranks(ys)
    n = len(rx)
    mx, my = sum(rx) / n, sum(ry) / n
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    dx = math.sqrt(sum((a - mx) ** 2 for a in rx))
    dy = math.sqrt(sum((b - my) ** 2 for b in ry))
    if dx == 0 or dy == 0:
        return float("nan")
    return num / (dx * dy)


def summarize(values: list[float]) -> dict:
    return {
        "n": len(values),
        "median": round(statistics.median(values), 2),
        "mean": round(statistics.fmean(values), 2),
        "p5": round(pct(values, 5), 2),
        "p95": round(pct(values, 95), 2),
        "min": round(min(values), 2),
        "max": round(max(values), 2),
        "frac_favorable": round(sum(1 for v in values if v < 0) / len(values), 3),
        "frac_zero": round(sum(1 for v in values if v == 0) / len(values), 3),
        "frac_adverse": round(sum(1 for v in values if v > 0) / len(values), 3),
    }


# --------------------------------------------------------------------------
# run
# --------------------------------------------------------------------------

def run_seed(seed: int, scen: dict, solve_seconds: float) -> dict:
    inst = build_instance(seed, scen, solve_seconds)

    plans = {}
    plans["naive"] = plan_baseline(inst)
    plans["greedy2opt"] = plan_greedy_2opt(inst)
    plans["cpsat"] = plan_optimized(inst, max_seconds=solve_seconds, warm_start=plans["naive"])
    plans["cpsat_ws2opt"] = plan_optimized(
        inst, max_seconds=solve_seconds, warm_start=plans["greedy2opt"]
    )

    row = {"seed": seed, **scen}
    row["jobs_total"] = len(inst.jobs)
    row["parts_blocked"] = sum(1 for j in inst.jobs if j.part_blocked)
    row["load_ratio"] = round(
        sum(j.duration for j in inst.jobs)
        / max(1, sum(t.shift_end - t.shift_start for t in inst.technicians)),
        3,
    )
    for arm, plan in plans.items():
        validate(inst, plan)
        m = plan_metrics(inst, plan)
        for k in METRIC_KEYS:
            row[f"{arm}_{k}"] = m[k]
        row[f"{arm}_status"] = m["status"]

    for arm in ("cpsat", "cpsat_ws2opt"):
        for ref in ("naive", "greedy2opt"):
            for k in ("sla_breaches", "overtime_hours", "jobs_completed", "travel_hours"):
                row[f"d_{arm}_vs_{ref}_{k}"] = round(row[f"{arm}_{k}"] - row[f"{ref}_{k}"], 2)
    for k in ("sla_breaches", "overtime_hours", "jobs_completed", "travel_hours"):
        row[f"d_greedy2opt_vs_naive_{k}"] = round(row[f"greedy2opt_{k}"] - row[f"naive_{k}"], 2)

    return row


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--seeds", type=int, default=200)
    ap.add_argument("--start-seed", type=int, default=1000)
    ap.add_argument("--solve-seconds", type=float, default=8.0)
    ap.add_argument("--out", default="backend/experiments/results/seed_sweep.csv")
    args = ap.parse_args(argv)

    scen_rng = random.Random(20260728)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    rows: list[dict] = []
    t0 = time.perf_counter()
    for i in range(args.seeds):
        seed = args.start_seed + i
        scen = sample_scenario(scen_rng)
        rows.append(run_seed(seed, scen, args.solve_seconds))
        if (i + 1) % 10 == 0:
            el = time.perf_counter() - t0
            print(
                f"  {i + 1}/{args.seeds} seeds  {el:.0f}s elapsed  "
                f"({el / (i + 1):.1f}s/seed)",
                file=sys.stderr,
                flush=True,
            )
    wall = time.perf_counter() - t0

    with out.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    report(rows, wall, args, out)
    return 0


def report(rows: list[dict], wall: float, args, out: Path) -> None:
    n = len(rows)
    print(f"\n{'=' * 78}")
    print(f"SEED SWEEP  n={n}  solve budget={args.solve_seconds}s/arm  wall={wall:.1f}s")
    print(f"raw rows: {out}")
    print("=" * 78)

    print("\n-- absolute levels (median across seeds) --")
    print(f"{'arm':<14}{'completed':>10}{'breaches':>10}{'breach%':>9}{'OT hrs':>9}{'travel h':>10}{'solve s':>9}")
    for arm in ARMS:
        comp = [r[f"{arm}_jobs_completed"] for r in rows]
        br = [r[f"{arm}_sla_breaches"] for r in rows]
        rate = [
            100.0 * r[f"{arm}_sla_breaches"] / max(1, r[f"{arm}_jobs_completed"]) for r in rows
        ]
        ot = [r[f"{arm}_overtime_hours"] for r in rows]
        tv = [r[f"{arm}_travel_hours"] for r in rows]
        ss = [r[f"{arm}_solve_seconds"] for r in rows]
        print(
            f"{arm:<14}{statistics.median(comp):>10.1f}{statistics.median(br):>10.1f}"
            f"{statistics.median(rate):>9.1f}{statistics.median(ot):>9.1f}"
            f"{statistics.median(tv):>10.1f}{statistics.median(ss):>9.3f}"
        )

    comparisons = [
        ("cpsat vs naive          (the old claim)", "cpsat", "naive"),
        ("cpsat vs greedy2opt     (the honest one)", "cpsat", "greedy2opt"),
        ("cpsat_ws2opt vs greedy2opt", "cpsat_ws2opt", "greedy2opt"),
        ("greedy2opt vs naive", "greedy2opt", "naive"),
    ]
    for label, arm, ref in comparisons:
        print(f"\n-- {label} --")
        print(
            f"{'metric':<18}{'median':>9}{'p5':>9}{'p95':>9}{'mean':>9}"
            f"{'better':>9}{'tie':>7}{'worse':>8}"
        )
        for k in ("sla_breaches", "overtime_hours", "jobs_completed", "travel_hours"):
            vals = [r[f"d_{arm}_vs_{ref}_{k}"] for r in rows]
            s = summarize(vals)
            # For jobs_completed, "more" is better, so flip the win/loss labels.
            better, worse = s["frac_favorable"], s["frac_adverse"]
            if k == "jobs_completed":
                better, worse = worse, better
            print(
                f"{k:<18}{s['median']:>9.2f}{s['p5']:>9.2f}{s['p95']:>9.2f}{s['mean']:>9.2f}"
                f"{better:>9.2f}{s['frac_zero']:>7.2f}{worse:>8.2f}"
            )

    print("\n-- inflation from the strawman (per seed) --")
    for k in ("sla_breaches", "overtime_hours"):
        vs_naive = [-r[f"d_cpsat_vs_naive_{k}"] for r in rows]
        vs_2opt = [-r[f"d_cpsat_vs_greedy2opt_{k}"] for r in rows]
        print(
            f"{k:<18} claimed-vs-naive median={statistics.median(vs_naive):>7.2f}   "
            f"honest-vs-2opt median={statistics.median(vs_2opt):>7.2f}"
        )

    print("\n-- sensitivity: Spearman rho vs (cpsat - greedy2opt) --")
    knobs = [
        "n_techs", "n_jobs", "skill_mix", "emergency_rate",
        "speed_factor", "traffic_penalty", "load_ratio",
    ]
    print(f"{'knob':<18}{'rho(breaches)':>15}{'rho(overtime)':>15}{'rho(completed)':>16}")
    for knob in knobs:
        xs = [float(r[knob]) for r in rows]
        rb = spearman(xs, [r["d_cpsat_vs_greedy2opt_sla_breaches"] for r in rows])
        ro = spearman(xs, [r["d_cpsat_vs_greedy2opt_overtime_hours"] for r in rows])
        rc = spearman(xs, [r["d_cpsat_vs_greedy2opt_jobs_completed"] for r in rows])
        print(f"{knob:<18}{rb:>15.3f}{ro:>15.3f}{rc:>16.3f}")

    print("\n-- CP-SAT solver status mix --")
    for arm in ("cpsat", "cpsat_ws2opt"):
        counts: dict[str, int] = {}
        for r in rows:
            counts[r[f"{arm}_status"]] = counts.get(r[f"{arm}_status"], 0) + 1
        print(f"{arm:<14}{counts}")


if __name__ == "__main__":
    raise SystemExit(main())
