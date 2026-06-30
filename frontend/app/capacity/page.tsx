"use client";

import { useMemo, useState } from "react";
import { ChartLegend, FrontierChart, Series } from "@/components/FrontierChart";
import { useDispatch } from "@/app/providers";
import { CapacityPoint, CapacityResult, DEFAULT_SWEEP, SweepConfig, capacitySweep } from "@/lib/api";

const ON = "var(--accent)";
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

  const { xs, jobsSeries, overtimeSeries } = useMemo(() => buildSeries(result), [result]);

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
            className="rounded-md px-4 py-2 font-semibold" style={{ background: "var(--accent)", color: "#06202b", opacity: busy ? 0.6 : 1 }}>
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
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold">Jobs completed vs crew size</h2>
                <ChartLegend series={legend(cfg.include_overtime_off)} />
              </div>
              <FrontierChart xValues={xs} series={jobsSeries} yLabel="Jobs" />
            </div>
            <div className="panel p-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold">Overtime hours vs crew size</h2>
                <ChartLegend series={[{ label: "Overtime allowed", color: ON }]} />
              </div>
              <FrontierChart xValues={xs} series={overtimeSeries} yLabel="OT hours" />
              <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                Overtime substitutes for crew: the optimizer spends more of it as a larger team
                completes more work. Weigh these hours against the cost of another hire — the gap
                between the two job lines is what overtime buys.
              </p>
            </div>
          </div>

          <div className="panel p-5">
            <h2 className="font-semibold mb-3">Marginal value — jobs gained per added technician</h2>
            <MarginalBars result={result} />
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

function MarginalBars({ result }: { result: CapacityResult }) {
  const max = Math.max(1, ...result.marginal.map((m) => Math.abs(m.delta_jobs)));
  return (
    <div className="space-y-2">
      {result.marginal.map((m) => (
        <div key={m.technician_count} className="flex items-center gap-3 text-sm">
          <span className="w-28" style={{ color: "var(--muted)" }}>
            +1 tech → {m.technician_count}
          </span>
          <div className="flex-1 h-5 rounded" style={{ background: "var(--panel-2)" }}>
            <div className="h-5 rounded flex items-center justify-end pr-2"
              style={{ width: `${Math.max((m.delta_jobs / max) * 100, 4)}%`, background: m.delta_jobs > 0 ? "var(--good)" : "var(--muted)" }}>
              <span className="text-xs mono" style={{ color: "#06202b" }}>+{m.delta_jobs}</span>
            </div>
          </div>
          <span className="w-28 text-right text-xs mono" style={{ color: m.delta_overtime < 0 ? "var(--good)" : "var(--muted)" }}>
            {m.delta_overtime <= 0 ? "" : "+"}{m.delta_overtime}h overtime
          </span>
        </div>
      ))}
    </div>
  );
}

function buildSeries(result: CapacityResult | null) {
  if (!result) return { xs: [] as number[], jobsSeries: [] as Series[], overtimeSeries: [] as Series[] };
  const xs = result.technician_counts;
  const on = new Map<number, CapacityPoint>();
  const off = new Map<number, CapacityPoint>();
  result.points.forEach((p) => (p.overtime_allowed ? on : off).set(p.technician_count, p));
  const hasOff = off.size > 0;
  const twoSeries = (pick: (p: CapacityPoint) => number): Series[] => {
    const s: Series[] = [
      { label: "Overtime allowed", color: ON, values: xs.map((c) => (on.has(c) ? pick(on.get(c)!) : null)) },
    ];
    if (hasOff) s.push({ label: "No overtime", color: OFF, values: xs.map((c) => (off.has(c) ? pick(off.get(c)!) : null)) });
    return s;
  };
  // Overtime only applies to the overtime-allowed plan (off series is ~0).
  const overtimeSeries: Series[] = [
    { label: "Overtime allowed", color: ON, values: xs.map((c) => (on.has(c) ? on.get(c)!.overtime_hours : null)) },
  ];
  return { xs, jobsSeries: twoSeries((p) => p.jobs_completed), overtimeSeries };
}

function legend(hasOff: boolean) {
  const l = [{ label: "Overtime allowed", color: ON }];
  if (hasOff) l.push({ label: "No overtime", color: OFF });
  return l;
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
