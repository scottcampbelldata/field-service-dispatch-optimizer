# Optimization model

The optimizer assigns technicians to jobs and sequences each technician's route.
It is a **vehicle-routing problem with time windows (VRPTW) plus assignment**,
solved with Google OR-Tools **CP-SAT**.

## Decision variables

For each feasible `(technician, job)` pair:

- `visit[t, j]` — boolean, 1 if technician `t` performs job `j`.
- `start[t, j]` — integer start minute, bounded to `[shift_start, horizon − duration]`.
- `breach[t, j]` — boolean, 1 if the job finishes after its SLA deadline.
- `overtime[t, j]` — integer overtime minutes used by the assignment.

Per technician, a routing **circuit** is built over `{home} ∪ candidate jobs`
using `AddCircuit`. Self-loop arcs make a node optional (a job not visited by
that technician), and arc literals carry the travel time between consecutive
stops.

## Constraints

- **Assignment:** `Σ_t visit[t, j] ≤ 1` — each job is done at most once.
- **Skill + certification:** variables only exist for technicians certified in
  the job's required skill.
- **Parts:** a job needing an unavailable part is never a candidate.
- **Shift / overtime:** the start-time domain forces completion within the shift,
  or within `shift_end + overtime_cap` when overtime is allowed and the
  technician is eligible.
- **Travel sequencing:** for an active arc `i → k`, `start[k] ≥ end[i] +
  travel(i, k)`.
- **SLA:** soft by default — `end ≤ deadline` is enforced only when the job is
  visited and not flagged as a breach, so a late visit forces `breach = 1`.
  Under **strict** strictness, top-priority (P1) SLAs become hard constraints.

## Objective

Maximize:

```
  Σ  priority_reward(j) · visit[t, j]
− w_travel    · total_travel_minutes
− w_sla       · Σ breach
− w_overtime  · Σ overtime_minutes
```

`priority_reward = w_completed · (5 − priority)`, so a P1 job is worth 4× the
base reward and a P4 job 1×. The default `w_completed` is tuned so even the
lowest-priority reward exceeds an SLA-breach penalty — completing work dominates,
and the optimizer improves quality without sacrificing throughput.

The UI sliders feed these weights directly: *traffic penalty* scales both the
travel matrix and `w_travel`; *SLA strictness* and *optimization goal* adjust
`w_sla`, `w_completed`, and `w_travel`.

## Keeping live solves tractable and trustworthy

Two techniques make an 8-second live solve reliable:

1. **Candidate capping.** Each technician only considers its nearest feasible
   jobs (plus everything the baseline assigned to it). This keeps the routing
   circuits small instead of `O(jobs)` per technician.
2. **Warm start.** The greedy baseline is hinted into the model as a complete,
   feasible solution. CP-SAT therefore always has an incumbent at least as good
   as the baseline, so the optimized plan never loses to the baseline even when
   the solver cannot prove optimality within the time budget.

## The baseline (foil)

The "manual dispatch" baseline is intentionally naive: sort jobs by priority,
then SLA deadline, and assign each to the nearest qualified technician who can
still fit it. No lookahead, no global trade-offs. It obeys the *same* feasibility
rules as CP-SAT, so the comparison isolates planning quality — not different
assumptions.
