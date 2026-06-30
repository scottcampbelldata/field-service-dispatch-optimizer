"use client";

import { useEffect, useRef, useState } from "react";
import { useDispatch } from "@/app/providers";
import { RoutingProvider } from "@/lib/api";

const PROVIDERS: { id: RoutingProvider; label: string; blurb: string }[] = [
  { id: "haversine", label: "Haversine", blurb: "Great-circle distance. Free, offline, no key." },
  { id: "openrouteservice", label: "OpenRouteService", blurb: "Real road durations. Needs your free key." },
  { id: "osrm", label: "OSRM", blurb: "Real road durations from an OSRM endpoint." },
];

export function RoutingSettings() {
  const { routing, setRouting } = useDispatch();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const active = PROVIDERS.find((p) => p.id === routing.provider)!;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="px-2 py-1 rounded-md text-xs flex items-center gap-1.5"
        style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--muted)" }}
        title="Routing settings (session only)"
      >
        <Gear />
        <span className="hidden sm:inline">Routing: {active.label}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 z-[1000] w-72 rounded-lg p-3 space-y-3 text-sm"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "0 12px 32px rgba(0,0,0,.5)" }}
        >
          <div>
            <div className="font-semibold">Travel routing</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              Applies to your next optimize. Session only — sent per request, never stored.
            </div>
          </div>

          <div className="space-y-1.5">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => setRouting({ provider: p.id })}
                className="w-full text-left rounded-md px-2.5 py-2"
                style={{
                  background: routing.provider === p.id ? "var(--panel-2)" : "transparent",
                  border: `1px solid ${routing.provider === p.id ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.label}</span>
                  {routing.provider === p.id && <span style={{ color: "var(--accent)" }}>●</span>}
                </div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>{p.blurb}</div>
              </button>
            ))}
          </div>

          {routing.provider === "openrouteservice" && (
            <Field label="OpenRouteService API key">
              <input
                type="password"
                value={routing.api_key ?? ""}
                onChange={(e) => setRouting({ api_key: e.target.value })}
                placeholder="paste your key"
                className="w-full rounded-md px-2 py-1.5 text-sm mono"
                style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--foreground)" }}
              />
              <a href="https://openrouteservice.org/dev/#/signup" target="_blank" rel="noreferrer"
                className="text-xs" style={{ color: "var(--accent)" }}>
                get a free key →
              </a>
            </Field>
          )}

          {routing.provider === "osrm" && (
            <Field label="OSRM endpoint">
              <input
                type="text"
                value={routing.osrm_base_url ?? ""}
                onChange={(e) => setRouting({ osrm_base_url: e.target.value })}
                placeholder="https://router.project-osrm.org"
                className="w-full rounded-md px-2 py-1.5 text-sm mono"
                style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--foreground)" }}
              />
            </Field>
          )}

          <p className="text-xs" style={{ color: "var(--muted)" }}>
            If a key is missing or a call fails, travel safely falls back to Haversine.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs" style={{ color: "var(--muted)" }}>{label}</div>
      {children}
    </div>
  );
}

function Gear() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
