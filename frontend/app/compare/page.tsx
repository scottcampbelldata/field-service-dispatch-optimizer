"use client";

import Link from "next/link";
import { BeforeAfterChart, UtilizationChart } from "@/components/Charts";
import { MetricCard } from "@/components/MetricCard";
import MapView from "@/components/MapView";
import { useDispatch } from "@/app/providers";
import { Metrics, Comparison } from "@/lib/api";
import { REASON_LABEL, hhmm } from "@/lib/format";

export default function ComparePage() {
  const { result, loading, runOptimize } = useDispatch();

  if (!result) {
    return (
      <div className="mx-auto max-w-2xl p-10 text-center space-y-4">
        <h2 className="text-xl font-semibold">No plan yet</h2>
        <p style={{ color: "var(--muted)" }}>
          Set a scenario on the Dispatch Board and run the optimizer, or solve with the
          current defaults right here.
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => runOptimize()} disabled={loading}
            className="rounded-md px-4 py-2 font-semibold"
            style={{ background: "var(--accent)", color: "#06202b", opacity: loading ? 0.6 : 1 }}>
            {loading ? "Solving…" : "Optimize with defaults"}
          </button>
          <Link href="/" className="rounded-md px-4 py-2"
            style={{ border: "1px solid var(--border)", color: "var(--muted)" }}>
            Go to Dispatch Board
          </Link>
        </div>
      </div>
    );
  }

  const b = result.baseline.metrics;
  const o = result.optimized.metrics;
  const c = result.comparison;
  const insights = buildInsights(b, o, c);

  return (
    <div className="mx-auto max-w-7xl p-5 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Manual baseline vs optimized plan</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Same technicians, jobs, and constraints — only the planning differs.
          </p>
        </div>
        <div className="text-xs mono" style={{ color: "var(--muted)" }}>
          solver {o.solve_status} · {o.solve_seconds}s · batch {result.batch_id}
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Jobs completed" value={o.jobs_completed} delta={c.jobs_completed_delta} />
        <MetricCard label="SLA breaches" value={o.sla_breaches} delta={c.sla_breaches_delta} betterWhenLower />
        <MetricCard label="Travel hours" value={o.travel_hours} delta={c.travel_hours_delta} betterWhenLower />
        <MetricCard label="Overtime hours" value={o.overtime_hours} delta={c.overtime_hours_delta} betterWhenLower />
        <MetricCard label="Unassigned" value={o.unassigned} delta={c.unassigned_delta} betterWhenLower />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="font-semibold mb-4">Before / after</h2>
          <BeforeAfterChart rows={[
            { label: "Jobs completed", baseline: b.jobs_completed, optimized: o.jobs_completed },
            { label: "SLA breaches", baseline: b.sla_breaches, optimized: o.sla_breaches },
            { label: "Travel hours", baseline: b.travel_hours, optimized: o.travel_hours, unit: "h" },
            { label: "Overtime hours", baseline: b.overtime_hours, optimized: o.overtime_hours, unit: "h" },
          ]} />
        </div>

        <div className="panel p-5 space-y-4">
          <h2 className="font-semibold">Executive read</h2>
          <div className="rounded-lg p-3" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}>
            <div className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              Bottleneck
            </div>
            <div className="mt-1 text-lg font-semibold">
              {o.bottleneck_skill ?? "None"}
              <span className="text-sm font-normal" style={{ color: "var(--muted)" }}>
                {" "}— most unmet / late demand
              </span>
            </div>
          </div>
          <ul className="space-y-2 text-sm">
            {insights.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span style={{ color: "var(--accent)" }}>▸</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="panel p-5">
        <h2 className="font-semibold mb-1">Technician utilization</h2>
        <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
          grey = manual baseline, cyan = optimized
        </p>
        <UtilizationChart baseline={result.baseline.utilization} optimized={result.optimized.utilization} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="panel p-4">
          <h2 className="font-semibold mb-3">Optimized routes</h2>
          <div className="aspect-[16/10] w-full">
            <MapView
              technicians={result.optimized.routes.map((r) => ({
                home_x: r.home_x, home_y: r.home_y, name: r.tech_name,
              }))}
              routes={result.optimized.routes}
            />
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <h2 className="font-semibold">Unassigned ({result.optimized.unassigned.length})</h2>
          </div>
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full text-sm">
              <tbody>
                {result.optimized.unassigned.map((u) => (
                  <tr key={u.job_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2 mono">#{u.job_id}</td>
                    <td className="px-4 py-2">{u.required_skill}</td>
                    <td className="px-4 py-2 text-xs" style={{ color: "var(--muted)" }}>
                      {REASON_LABEL[u.reason] ?? u.reason}
                    </td>
                    <td className="px-4 py-2 mono text-xs">{hhmm(u.start)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildInsights(b: Metrics, o: Metrics, c: Comparison): string[] {
  const out: string[] = [];
  if (c.sla_breaches_delta < 0)
    out.push(`Optimization prevents ${-c.sla_breaches_delta} SLA breaches (${b.sla_breaches} → ${o.sla_breaches}).`);
  if (c.overtime_hours_delta < 0)
    out.push(`Overtime drops ${(-c.overtime_hours_delta).toFixed(1)} hours (${b.overtime_hours}h → ${o.overtime_hours}h) for the same crew.`);
  if (c.travel_hours_delta < 0 && b.travel_hours > 0)
    out.push(`Travel falls ${Math.round((-c.travel_hours_delta / b.travel_hours) * 100)}% (${b.travel_hours}h → ${o.travel_hours}h).`);
  if (c.jobs_completed_delta > 0)
    out.push(`${c.jobs_completed_delta} more jobs completed without adding technicians.`);
  if (o.bottleneck_skill)
    out.push(`The binding constraint is ${o.bottleneck_skill} capacity, not headcount — target hiring or cross-training there.`);
  if (o.unassigned > 0)
    out.push(`${o.unassigned} low-value jobs are deferred to protect higher-priority SLAs.`);
  return out;
}
