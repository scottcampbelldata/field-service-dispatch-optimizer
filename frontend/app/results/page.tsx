"use client";

import { useMemo } from "react";
import { EmptyState } from "@/components/EmptyState";
import MapView from "@/components/MapView";
import { useDispatch } from "@/app/providers";
import { Route, Stop } from "@/lib/api";
import { hhmm, priorityColor } from "@/lib/format";

export default function ResultsPage() {
  const { result, workload } = useDispatch();

  const shiftById = useMemo(() => {
    const m = new Map<number, { start: number; end: number }>();
    workload?.technicians.forEach((t) => m.set(t.id, { start: t.shift_start, end: t.shift_end }));
    return m;
  }, [workload]);

  if (!result) return <EmptyState title="No optimized plan yet" />;

  const routes = result.optimized.routes;
  const lateStops = routes.flatMap((r) => r.stops.filter((s) => s.is_sla_breach));
  const otStops = routes.flatMap((r) => r.stops.filter((s) => s.is_overtime));

  // Day window for the timelines.
  let dayStart = 1440, dayEnd = 0;
  for (const t of workload?.technicians ?? []) {
    dayStart = Math.min(dayStart, t.shift_start);
    dayEnd = Math.max(dayEnd, t.shift_end + 120);
  }
  if (dayStart >= dayEnd) { dayStart = 420; dayEnd = 1200; }

  return (
    <div className="mx-auto max-w-7xl p-5 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Optimizer results</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Recommended assignment and route order - {routes.length} technicians dispatched,
          solver {result.optimized.metrics.solve_status} in {result.optimized.metrics.solve_seconds}s
          {result.optimized.optimality_gap != null && (
            <> · {result.optimized.optimality_gap === 0
              ? "proven optimal"
              : `within ${result.optimized.optimality_gap}% of optimal`}</>
          )} · travel via {result.routing.provider}.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Mini label="Technicians dispatched" value={routes.length} />
        <Mini label="Jobs scheduled" value={result.optimized.metrics.jobs_completed} />
        <Mini label="Late jobs (SLA risk)" value={lateStops.length} tone={lateStops.length ? "bad" : "good"} />
        <Mini label="Overtime jobs" value={otStops.length} tone={otStops.length ? "warn" : "good"} />
      </div>

      <div className="panel p-4">
        <h2 className="font-semibold mb-3">Route map</h2>
        <div className="aspect-[16/9] w-full">
          <MapView
            technicians={routes.map((r) => ({ home_x: r.home_x, home_y: r.home_y, name: r.tech_name }))}
            routes={routes}
          />
        </div>
      </div>

      <div className="panel p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Technician routes</h2>
          <TimeAxis dayStart={dayStart} dayEnd={dayEnd} />
        </div>
        <div className="space-y-3">
          {routes.map((r) => (
            <RouteRow key={r.tech_id} route={r} shift={shiftById.get(r.tech_id)}
              dayStart={dayStart} dayEnd={dayEnd} />
          ))}
        </div>
        <Legend />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <StopTable title={`Late jobs - SLA breached (${lateStops.length})`} stops={lateStops} kind="late" />
        <UnassignedTable />
      </div>
    </div>
  );
}

function RouteRow({ route, shift, dayStart, dayEnd }: {
  route: Route; shift?: { start: number; end: number }; dayStart: number; dayEnd: number;
}) {
  const span = dayEnd - dayStart;
  const pct = (m: number) => `${((m - dayStart) / span) * 100}%`;
  const wpct = (a: number, b: number) => `${((b - a) / span) * 100}%`;
  return (
    <div className="flex items-center gap-3">
      <div className="w-20 text-sm" style={{ color: "var(--muted)" }}>{route.tech_name}</div>
      <div className="relative flex-1 h-8 rounded" style={{ background: "var(--panel-2)" }}>
        {/* shift window */}
        {shift && (
          <div className="absolute top-0 bottom-0 rounded"
            style={{ left: pct(shift.start), width: wpct(shift.start, shift.end),
                     background: "rgba(148,163,184,0.10)", border: "1px dashed var(--border)" }} />
        )}
        {/* job blocks */}
        {route.stops.map((s) => (
          <div key={s.job_id} title={`#${s.job_id} ${s.required_skill} ${hhmm(s.start)}-${hhmm(s.end)}`}
            className="absolute top-1 bottom-1 rounded flex items-center justify-center overflow-hidden"
            style={{
              left: pct(s.start), width: `max(${wpct(s.start, s.end)}, 10px)`,
              background: priorityColor(s.priority),
              border: s.is_sla_breach ? "2px solid var(--bad)" : s.is_overtime ? "2px solid var(--warn)" : "none",
            }}>
            <span className="text-[10px] font-medium mono" style={{ color: "var(--accent-contrast)" }}>{s.seq + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimeAxis({ dayStart, dayEnd }: { dayStart: number; dayEnd: number }) {
  return (
    <div className="text-xs mono" style={{ color: "var(--muted)" }}>
      {hhmm(dayStart)} - {hhmm(dayEnd)}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 mt-4 text-xs" style={{ color: "var(--muted)" }}>
      <span className="inline-flex items-center gap-1"><Dot c="#f43f5e" /> P1</span>
      <span className="inline-flex items-center gap-1"><Dot c="#f59e0b" /> P2</span>
      <span className="inline-flex items-center gap-1"><Dot c="#38bdf8" /> P3</span>
      <span className="inline-flex items-center gap-1"><Dot c="#94a3b8" /> P4</span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded" style={{ border: "2px solid var(--bad)" }} /> SLA breach
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded" style={{ border: "2px solid var(--warn)" }} /> overtime
      </span>
      <span>numbers = stop order</span>
    </div>
  );
}

function Dot({ c }: { c: string }) {
  return <span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />;
}

function Mini({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" | "warn" }) {
  const color = tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--warn)" : tone === "good" ? "var(--good)" : "var(--foreground)";
  return (
    <div className="panel p-4">
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="mt-1 text-3xl font-semibold mono" style={{ color }}>{value}</div>
    </div>
  );
}

function StopTable({ title, stops }: { title: string; stops: Stop[]; kind: "late" }) {
  return (
    <div className="panel overflow-hidden">
      <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="max-h-[320px] overflow-auto">
        <table className="w-full text-sm">
          <tbody>
            {stops.length === 0 && (
              <tr><td className="px-4 py-3" style={{ color: "var(--muted)" }}>None - all scheduled jobs meet SLA.</td></tr>
            )}
            {stops.map((s) => (
              <tr key={s.job_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2 mono">#{s.job_id}</td>
                <td className="px-4 py-2">{s.required_skill}</td>
                <td className="px-4 py-2">{s.site_name}</td>
                <td className="px-4 py-2 mono text-xs">finishes {hhmm(s.end)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UnassignedTable() {
  const { result } = useDispatch();
  const rows = result?.optimized.unassigned ?? [];
  return (
    <div className="panel overflow-hidden">
      <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-semibold">Unassigned ({rows.length})</h2>
      </div>
      <div className="max-h-[320px] overflow-auto">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((s) => (
              <tr key={s.job_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2 mono">#{s.job_id}</td>
                <td className="px-4 py-2">{s.required_skill}</td>
                <td className="px-4 py-2">{s.site_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
