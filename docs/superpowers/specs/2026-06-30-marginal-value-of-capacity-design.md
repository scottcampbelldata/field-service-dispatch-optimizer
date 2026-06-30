# Marginal Value of Capacity — Design

**Date:** 2026-06-30
**Status:** Approved (design); pending implementation
**Author:** Scott Campbell

A capacity-analysis feature that elevates the app from "make one decision" to
"quantify the decision frontier." It sweeps a capacity lever through the
optimizer and charts how the optimized plan's KPIs respond, answering: *should we
hire another technician, or just allow overtime — and where do returns flatten?*

## 1. Scope

**In:**
- Sweep **technician count** (X-axis), min (default 4) → full roster, ~5–6 points.
- **Two series:** overtime allowed vs overtime disabled.
- Hold all other scenario controls (jobs, traffic, skill shortage, SLA
  strictness) at the current values, so it analyzes the user's scenario.
- Charts: jobs completed vs technicians, SLA breaches vs technicians, marginal
  jobs-per-added-technician bars, and an auto-generated narrative callout.
- Behind an explicit **"Run analysis"** button with a progress indicator.

**Out (deferred):**
- Overtime-budget sweep as a second lever.
- Persisting sweep points to the database (analysis is transient).
- Cost/$ modeling (separate future upgrade).

## 2. Architecture

Reuses the existing optimizer and metrics; no new solver code.

- **`backend/app/sweep_service.py`** — thin orchestrator. For each
  `(technician_count, overtime_allowed)` config: `transform(base, **cfg)` →
  `plan_optimized` → `plan_metrics`. Returns a list of points. No DB writes.
- **`POST /api/capacity-sweep`** with `CapacitySweepRequest`:
  base scenario params + `min_techs`, `max_techs`, `steps`, `per_point_seconds`,
  `include_overtime_off`.
- **Frontend `/capacity` page** + a **"Capacity"** nav item; typed client and
  result types in `lib/api.ts`; charts via Recharts (existing dependency).

### Data flow

```
UI "Run analysis" → POST /api/capacity-sweep
  sweep_service: for cfg in configs:  (sequential)
     inst = transform(base, technician_count=n, overtime_allowed=ot, **scenario)
     opt  = plan_optimized(inst, max_seconds=per_point_seconds)
     point = { technician_count, overtime_allowed, metrics: plan_metrics(...) }
  → { points: [...], marginal: [...], narrative: "..." }
```

## 3. Runtime tradeoff

A sweep is ~5–6 points × 2 series ≈ 10 optimized solves. Per-point budget is
**short (~3s)** — trends are robust at low solve time because the throughput
floor + warm start guarantee each point still beats its baseline. Total ≈
25–35s behind an explicit button with progress text. Streaming (SSE) was
considered and rejected: more infrastructure for marginal UX gain on a
run-once analysis.

## 4. Marginal-value computation

`marginal_value(points_for_series)` returns, for the overtime-on series:
- `delta_jobs[i] = jobs[i] - jobs[i-1]` (jobs gained by the i-th added technician),
- `delta_breaches[i]`, similarly,
- `diminishing_at` = the first technician count where `delta_jobs < 1`.

The narrative is generated from these plus the gap between the two series at full
roster ("allowing overtime is worth ≈ N technicians" = horizontal distance
between the curves at a matched jobs level, reported simply as the OT-on vs
OT-off job/breach delta at max techs).

## 5. API shapes

Request:
```
{ ...OptimizeParams (scenario), min_techs, max_techs, steps,
  per_point_seconds, include_overtime_off }
```
Response:
```
{
  points: [{ technician_count, overtime_allowed,
             jobs_completed, sla_breaches, unassigned,
             overtime_hours, travel_hours }],
  marginal: [{ technician_count, delta_jobs, delta_breaches }],
  diminishing_at: number | null,
  narrative: string
}
```

## 6. Testing

`backend/tests/test_sweep.py` (small instance, short solve):
- Returns exactly the requested points (counts × series), each with valid metrics.
- Monotonic sanity: jobs at `max_techs` ≥ jobs at `min_techs` (overtime-on series).
- `marginal_value` helper: exact deltas + correct `diminishing_at` on a
  hand-built series.

## 7. Out-of-scope guardrails

- Cap total solves (`steps` ≤ 8, series ≤ 2) so a request can't explode.
- `per_point_seconds` clamped (e.g., 1–10) so a sweep can't hang.
