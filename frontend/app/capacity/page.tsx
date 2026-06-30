"use client";

import { useMemo, useState } from "react";
import { MarginalBarChart, ThemedLineChart } from "@/components/CapacityCharts";
import { useDispatch } from "@/app/providers";
import { CapacityPoint, CapacityResult, DEFAULT_SWEEP, SweepConfig, capacitySweep } from "@/lib/api";

const ON = "#22d3ee";
const OFF = "#94a3b8";

export default function CapacityPage() {
  const { params, routing, workload } = useDispatch();
  const roster = workload?.technicians.length ?? 12;

  const [cfg, setCfg] = useState<SweepConfig>(DEFAULT_SWEEP);
  const [result, setResult] = useState<CapacityResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const solves = cfg.steps * (cfg.include_overtime_off ? 2 : 1);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await capacitySweep(params, { ...cfg, max_techs: roster }, routing));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const { lineData, marginalData, hasOff } = useMemo(() => buildChartData(result), [result]);

  return (
    <div className="mx-auto max-w-6xl p-5 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Marginal value of capacity</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Sweep crew size through the optimizer to see the decision frontier — what each added
          technician is worth, and whether overtime substitutes for hiring. Uses your current
          scenario settings from the Dispatch Board.
        </p>
      </div>

      <div className="panel p-4 flex flex-wrap items-end gap-4">
        <Control label="Points">
          <select value={cfg.steps} onChange={(e) => setCfg({ ...cfg, steps: +e.target.value })}
            className="rounded-md px-2 py-1.5 text-sm" style={selStyle}>
            {[4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Control>
        <Control label="Seconds / point">
          <select value={cfg.per_point_seconds} onChange={(e) => setCfg({ ...cfg, per_point_seconds: +e.target.value })}
            className="rounded-md px-2 py-1.5 text-sm" style={selStyle}>
            {[2, 3, 4].map((n) => <option key={n} value={n}>{n}s</option>)}
          </select>
        </Control>
        <Control label="Overtime series">
          <button onClick={() => setCfg({ ...cfg, include_overtime_off: !cfg.include_overtime_off })}
            className="rounded-md px-2 py-1.5 text-sm" style={selStyle}>
            {cfg.include_overtime_off ? "On + Off" : "On only"}
          </button>
        </Control>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            ~{solves} solves · est {Math.round(solves * cfg.per_point_seconds)}s
          </span>
          <button onClick={run} disabled={busy}
            className="rounded-md px-4 py-2 font-semibold" style={{ background: "var(--accent)", color: "var(--accent-contrast)", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Running analysis…" : "Run analysis"}
          </button>
        </div>
      </div>

      {error && <div className="panel p-4" style={{ color: "var(--bad)" }}>{error}</div>}

      {!result && !busy && (
        <div className="panel p-8 text-center" style={{ color: "var(--muted)" }}>
          Run the analysis to chart the capacity frontier.
        </div>
      )}

      {busy && (
        <div className="panel p-8 text-center" style={{ color: "var(--muted)" }}>
          Solving {solves} schedules across crew sizes… this takes ~{Math.round(solves * cfg.per_point_seconds)}s.
        </div>
      )}

      {result && !busy && (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="panel p-5">
              <h2 className="font-semibold mb-2">Jobs completed vs crew size</h2>
              <ThemedLineChart data={lineData} xKey="techs" yLabel="Jobs"
                lines={[
                  { key: "jobsOn", name: "Overtime allowed", color: ON },
                  ...(hasOff ? [{ key: "jobsOff", name: "No overtime", color: OFF }] : []),
                ]} />
            </div>
            <div className="panel p-5">
              <h2 className="font-semibold mb-2">Overtime hours vs crew size</h2>
              <ThemedLineChart data={lineData} xKey="techs" yLabel="OT hours"
                lines={[{ key: "otOn", name: "Overtime allowed", color: ON }]} />
              <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                Overtime substitutes for crew: the optimizer spends more of it as a larger team
                completes more work. Weigh these hours against the cost of another hire — the gap
                between the two job lines is what overtime buys.
              </p>
            </div>
          </div>

          <div className="panel p-5">
            <h2 className="font-semibold mb-3">Marginal value — jobs gained per added technician</h2>
            <MarginalBarChart data={marginalData} />
          </div>

          <div className="panel p-5">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="font-semibold">Read-out</h2>
              {result.diminishing_at != null && (
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--warn)", color: "#1a0008" }}>
                  diminishing returns @ {result.diminishing_at} techs
                </span>
              )}
            </div>
            <p className="leading-relaxed">{result.narrative}</p>
          </div>
        </>
      )}
    </div>
  );
}

function buildChartData(result: CapacityResult | null) {
  if (!result) return { lineData: [], marginalData: [], hasOff: false };
  const on = new Map<number, CapacityPoint>();
  const off = new Map<number, CapacityPoint>();
  result.points.forEach((p) => (p.overtime_allowed ? on : off).set(p.technician_count, p));
  const hasOff = off.size > 0;
  const lineData = result.technician_counts.map((c) => ({
    techs: c,
    jobsOn: on.get(c)?.jobs_completed ?? null,
    jobsOff: off.get(c)?.jobs_completed ?? null,
    otOn: on.get(c)?.overtime_hours ?? null,
  }));
  const marginalData = result.marginal.map((m) => ({
    label: `→ ${m.technician_count}`,
    deltaJobs: m.delta_jobs,
    deltaOvertime: m.delta_overtime,
  }));
  return { lineData, marginalData, hasOff };
}

const selStyle = { background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--foreground)" };

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs" style={{ color: "var(--muted)" }}>{label}</div>
      {children}
    </div>
  );
}
