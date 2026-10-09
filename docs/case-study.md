# Case study: a day at Atlas Field Services

Atlas Field Services runs commercial-facilities maintenance across a region. On a
typical day the dispatcher faces more work than the crews can finish: **12
technicians, 110 jobs, 6 skills**, hard SLA deadlines, travel between sites,
fixed shifts, limited overtime, and some jobs blocked on parts.

The question is **"what should we do next?"**

## The two plans

Both plans see the same technicians, jobs, and constraints. Only the planning
differs.

- **Manual baseline**: the common-sense rule, highest priority first, nearest
  qualified technician, no global trade-offs.
- **Optimized**: OR-Tools CP-SAT, warm-started from the baseline, minimizing a
  weighted objective over completion, travel, SLA breaches, and overtime.

## Result across 200 randomized scenarios

This section previously reported one seeded day against a naive baseline. That
comparison was not informative: the naive dispatcher misses a median of 45.6% of
the deadlines it schedules, so beating it measured the strawman rather than the
solver. It also did not reproduce; on seed 42 the baseline records 32 breaches,
not 33, and the optimized column only reaches 15 at roughly a 60s budget rather
than the documented 8s default.

The current benchmark compares three planners across 200 randomized scenarios
against a real baseline, greedy nearest-qualified with 2-opt improvement and
cheapest-insertion backfill:

| Comparison | SLA breaches (median) | 5th-95th pct | Overtime hours (median) |
|------------|----------------------:|-------------:|------------------------:|
| greedy+2-opt vs naive | **12 fewer** | 3 to 22 fewer | 3.35 fewer |
| CP-SAT vs naive | 5 fewer | 14 fewer to 0 | 2.20 fewer |
| CP-SAT vs greedy+2-opt | roughly at parity | | |

Budget sweep over 24 scenarios, median SLA difference vs greedy+2-opt:

| Solver budget | 2s | 8s (shipped) | 30s | 60s |
|---------------|---:|-------------:|----:|----:|
| Median difference | +9 worse | +5 worse | 3 better | 5 better |

The finding is that the shipped 8s budget sits below the threshold where
constraint programming beats a good heuristic, not that the model is wrong.

The greedy and naive arms are deterministic. The CP-SAT arm is not: 8 search
workers race a wall-clock limit, so `random_seed=42` does not determinize it and
per-scenario verdicts shift across runs. Only the distribution is meaningful.

## What the optimizer reveals

- **The bottleneck is a skill, not headcount.** The "executive read" surfaces the
  skill with the most unmet and late demand. Hiring or cross-training there beats
  adding general headcount.
- **A little overtime goes a long way.** A small overtime budget
  prevents a disproportionate number of SLA breaches; the model finds the knee.
- **Some low-value jobs should be deferred.** Protecting critical SLAs sometimes
  means dropping low-priority work on purpose. The optimizer makes that
  trade-off explicit and labels every unassigned job with a reason.

## Try the scenarios

The Dispatch Board lets you inject realistic chaos and re-solve live:

- Pull technicians off the schedule.
- Raise the traffic penalty (rush hour).
- Create a skill shortage (e.g. only one HVAC-certified tech).
- Tighten SLA strictness or disable overtime.
- Spike the emergency rate.

Each change is a real CP-SAT solve, and the comparison updates accordingly.
