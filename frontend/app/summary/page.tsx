"use client";

import { EmptyState } from "@/components/EmptyState";
import { useDispatch } from "@/app/providers";
import { OptimizeResult } from "@/lib/api";

export default function SummaryPage() {
  const { result } = useDispatch();
  if (!result) return <EmptyState title="No plan to summarize yet" />;

  const brief = buildBrief(result);
  const o = result.optimized.metrics;

  return (
    <div className="mx-auto max-w-4xl p-5 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Executive summary</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          The plan, translated into management language.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <Kpi label="Jobs completed" value={`${o.jobs_completed}/${o.jobs_total}`} />
        <Kpi label="SLA breaches" value={`${o.sla_breaches}`} />
        <Kpi label="P1 protection" value={`${o.high_priority_rate}%`} />
        <Kpi label="Overtime" value={`${o.overtime_hours}h`} />
        {result.cost && (
          <Kpi label="Est. annual savings" value={`$${Math.round(result.cost.savings_per_year).toLocaleString()}`} />
        )}
      </div>

      <div className="panel p-6 space-y-5">
        <p className="text-lg leading-relaxed">{brief.headline}</p>

        <div>
          <h2 className="text-sm uppercase tracking-wide mb-2" style={{ color: "var(--muted)" }}>
            Recommendations
          </h2>
          <ul className="space-y-2.5">
            {brief.recommendations.map((t, i) => (
              <li key={i} className="flex gap-2.5">
                <span style={{ color: "var(--accent)" }}>▸</span>
                <span className="leading-relaxed">{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg p-4" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}>
          <div className="text-sm uppercase tracking-wide mb-1" style={{ color: "var(--muted)" }}>
            Bottom line vs manual dispatch
          </div>
          <p className="leading-relaxed">{brief.bottomLine}</p>
        </div>
      </div>
    </div>
  );
}

function buildBrief(r: OptimizeResult) {
  const o = r.optimized.metrics;
  const b = r.baseline.metrics;
  const c = r.comparison;
  const d = r.diagnostics;

  const headline =
    `The optimized plan completes ${o.jobs_completed} of ${o.jobs_total} jobs and holds SLA ` +
    `breaches to ${o.sla_breaches} (down from ${b.sla_breaches} under manual dispatch), ` +
    `using ${o.overtime_hours} hours of overtime across ${r.optimized.routes.length} technicians.`;

  const recommendations: string[] = [];

  // Bottleneck.
  if (d.bottleneck_skill) {
    const sd = d.skill_demand.find((s) => s.skill === d.bottleneck_skill);
    const capPct = Math.round((d.total_demand_minutes / Math.max(1, d.total_capacity_minutes)) * 100);
    if (sd) {
      recommendations.push(
        capPct <= 100
          ? `The bottleneck is not headcount - raw capacity covers ${capPct}% of demand. It is ${sd.skill} availability: ${sd.certified_techs} certified technician(s) against ${sd.jobs} jobs, leaving ${sd.unassigned} unserved and ${sd.breaches} late. Prioritize hiring or cross-training in ${sd.skill}.`
          : `Demand is ${capPct}% of available technician-hours - the day is over capacity. Adding crew or overtime, concentrated in ${sd.skill}, is the only way to clear the backlog.`
      );
    }
  }

  // Overtime leverage.
  if (o.overtime_hours > 0) {
    recommendations.push(
      `Overtime is leverage, not waste: ${o.overtime_hours} hours of overtime keeps higher-priority jobs inside their SLA windows. Disabling it (see the Scenario Simulator) pushes more work past deadline.`
    );
  }

  // Deferrals.
  const deferred = d.unassigned_by_reason.find((x) => x.reason === "unassigned_capacity")?.count ?? 0;
  if (deferred > 0) {
    recommendations.push(
      `${deferred} low-priority job(s) are deliberately deferred to protect critical SLAs - a deliberate trade-off, not an oversight.`
    );
  }

  // Utilization balance.
  const util = r.optimized.utilization.map((u) => u.utilization_pct);
  if (util.length) {
    const lo = Math.round(Math.min(...util));
    const hi = Math.round(Math.max(...util));
    recommendations.push(
      `Workload is spread across the crew (utilization ${lo}-${hi}%), avoiding the burnout-and-idle split that ad-hoc dispatching creates.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("The current plan is comfortably within capacity - no structural constraints are binding.");
  }

  const bottomLine =
    `Versus manual dispatch on the same day: ${c.jobs_completed_delta >= 0 ? "+" : ""}${c.jobs_completed_delta} jobs completed, ` +
    `${-c.sla_breaches_delta} fewer SLA breaches, ` +
    `${c.travel_hours_delta <= 0 ? `${-c.travel_hours_delta}h less travel` : `${c.travel_hours_delta}h more travel`}, and ` +
    `${c.overtime_hours_delta <= 0 ? `${-c.overtime_hours_delta}h less overtime` : `${c.overtime_hours_delta}h more overtime`} - the same people and trucks, planned better.`;

  const costLine = r.cost
    ? ` At the modeled rates that is about $${Math.round(r.cost.savings_per_day).toLocaleString()} per day` +
      ` (≈ $${Math.round(r.cost.savings_per_year).toLocaleString()} per year) in avoided cost.`
    : "";

  return { headline, recommendations, bottomLine: bottomLine + costLine };
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="mt-1 text-2xl font-semibold mono">{value}</div>
    </div>
  );
}
