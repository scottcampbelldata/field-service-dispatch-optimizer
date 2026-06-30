# Case study: a day at Atlas Field Services

Atlas Field Services runs commercial-facilities maintenance across a region. On a
typical day the dispatcher faces more work than the crews can finish: **12
technicians, 110 jobs, 6 skills**, hard SLA deadlines, travel between sites,
fixed shifts, limited overtime, and some jobs blocked on parts.

The question is not "what happened?" It is **"what should we do next?"**

## The two plans

Both plans see the same technicians, jobs, and constraints. Only the planning
differs.

- **Manual baseline** — the common-sense rule: highest priority first, nearest
  qualified technician, no global trade-offs.
- **Optimized** — OR-Tools CP-SAT, warm-started from the baseline, minimizing a
  weighted objective over completion, travel, SLA breaches, and overtime.

## Result on the canonical day (seed 42, default settings)

| Metric | Manual | Optimized | Change |
|--------|-------:|----------:|-------:|
| Jobs completed | 77 | **81** | +4 |
| SLA breaches | 33 | **15** | −18 |
| Travel hours | 18.4 | **17.1** | −1.3 |
| Overtime hours | 18.0 | **7.5** | −10.5 |
| Unassigned jobs | 33 | **29** | −4 |

More jobs completed **and** fewer breaches **and** less overtime — with the same
crew. The gain is planning quality, not extra resources. (Exact figures move with
the solver time budget; the direction is stable.)

## What the optimizer reveals

- **The bottleneck is a skill, not headcount.** The "executive read" surfaces the
  skill with the most unmet and late demand. Hiring or cross-training there beats
  adding general headcount.
- **Overtime is leverage, not waste — up to a point.** A small overtime budget
  prevents a disproportionate number of SLA breaches; the model finds the knee.
- **Some low-value jobs should be deferred.** Protecting critical SLAs sometimes
  means consciously dropping low-priority work — the optimizer makes that
  trade-off explicit and labels every unassigned job with a reason.

## Try the scenarios

The Dispatch Board lets you inject realistic chaos and re-solve live:

- Pull technicians off the schedule.
- Raise the traffic penalty (rush hour).
- Create a skill shortage (e.g. only one HVAC-certified tech).
- Tighten SLA strictness or disable overtime.
- Spike the emergency rate.

Each change is a real CP-SAT solve, and the comparison updates accordingly.
