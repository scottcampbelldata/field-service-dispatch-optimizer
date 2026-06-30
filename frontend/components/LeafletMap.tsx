"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { Route } from "@/lib/api";
import { PRIORITY_LABEL, hhmm, priorityColor } from "@/lib/format";

interface MapTech {
  home_x: number; home_y: number; name: string;
  skills?: string[]; shift_start?: number; shift_end?: number;
}
interface MapJob {
  id?: number; x: number; y: number; priority: number;
  site_name?: string; required_skill?: string; sla_deadline?: number;
  duration?: number; requires_part?: boolean; part_available?: boolean; is_emergency?: boolean;
}
interface Props {
  technicians: MapTech[];
  jobs?: MapJob[];
  routes?: Route[];
}

const ROUTE_HUES = [180, 150, 95, 45, 20, 320, 265, 210, 120, 0, 60, 290];
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function row(label: string, value: string) {
  return `<div class="row"><span>${label}</span><b>${value}</b></div>`;
}

function jobPopup(j: MapJob): string {
  const part = j.requires_part ? (j.part_available ? "in stock" : "missing") : "—";
  return `<div class="map-pop">
    <div class="map-pop-h">
      <span class="dot" style="background:${priorityColor(j.priority)}"></span>
      Job #${esc(j.id)} ${j.is_emergency ? '<span class="badge-em">EMERGENCY</span>' : ""}
    </div>
    ${row("Site", esc(j.site_name))}
    ${row("Skill", esc(j.required_skill))}
    ${row("Priority", esc(PRIORITY_LABEL[j.priority] ?? j.priority))}
    ${row("SLA deadline", hhmm(j.sla_deadline))}
    ${row("Duration", `${esc(j.duration)}m`)}
    ${row("Part", part)}
  </div>`;
}

function techPopup(t: MapTech, stops?: number): string {
  const shift = t.shift_start != null && t.shift_end != null
    ? `${hhmm(t.shift_start)}–${hhmm(t.shift_end)}` : "—";
  return `<div class="map-pop">
    <div class="map-pop-h">
      <span class="dot" style="background:var(--accent)"></span> ${esc(t.name)}
    </div>
    ${t.skills?.length ? row("Skills", esc(t.skills.join(", "))) : ""}
    ${row("Shift", shift)}
    ${stops != null ? row("Jobs on route", String(stops)) : ""}
  </div>`;
}

function stopPopup(s: Route["stops"][number], techName: string, color: string): string {
  const flags = [
    s.is_sla_breach ? '<span class="badge-em">SLA BREACH</span>' : "",
    s.is_overtime ? '<span class="badge-em" style="background:var(--warn)">OT</span>' : "",
  ].join(" ");
  return `<div class="map-pop">
    <div class="map-pop-h">
      <span class="dot" style="background:${color}"></span> Stop ${s.seq + 1} · Job #${esc(s.job_id)} ${flags}
    </div>
    ${row("Technician", esc(techName))}
    ${row("Skill", esc(s.required_skill))}
    ${row("Site", esc(s.site_name))}
    ${row("Window", `${hhmm(s.start)}–${hhmm(s.end)}`)}
  </div>`;
}

// Coordinates are [lon=x, lat=y]; Leaflet wants [lat, lon].
export default function LeafletMap({ technicians, jobs, routes }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ro: any;
    import("leaflet").then(({ default: L }) => {
      if (!active || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, { zoomControl: true });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);
      map.setView([32.85, -96.75], 11);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      LRef.current = L;
      ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(elRef.current);
      setTimeout(() => active && map.invalidateSize(), 120);
      setReady(true);
    });
    return () => {
      active = false;
      if (ro) ro.disconnect();
      if (mapRef.current) mapRef.current.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;

    layer.clearLayers();
    const bounds: [number, number][] = [];

    // hover emphasis helpers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hoverable = (m: any, baseR: number) => {
      m.on("mouseover", () => m.setRadius(baseR + 3));
      m.on("mouseout", () => m.setRadius(baseR));
      return m;
    };

    jobs?.forEach((j) => {
      const r = j.priority === 1 ? 6 : j.priority === 2 ? 5 : 4;
      const color = priorityColor(j.priority);
      const m = L.circleMarker([j.y, j.x], {
        radius: r, color: j.is_emergency ? "#ffffff" : color,
        weight: j.is_emergency ? 2 : 1, fillColor: color, fillOpacity: 0.75,
      }).addTo(layer);
      m.bindTooltip(`#${j.id ?? ""} · ${j.required_skill ?? ""}`, { direction: "top" });
      m.bindPopup(jobPopup(j));
      hoverable(m, r);
      bounds.push([j.y, j.x]);
    });

    routes?.forEach((rt, i) => {
      const color = `hsl(${ROUTE_HUES[i % ROUTE_HUES.length]} 80% 60%)`;
      const pts: [number, number][] = [
        [rt.home_y, rt.home_x],
        ...rt.stops.map((s) => [s.y, s.x] as [number, number]),
        [rt.home_y, rt.home_x],
      ];
      L.polyline(pts, { color, weight: 2, opacity: 0.85 }).addTo(layer);
      rt.stops.forEach((s) => {
        const m = L.circleMarker([s.y, s.x], {
          radius: 4, color, weight: 1, fillColor: color, fillOpacity: 0.95,
        }).addTo(layer);
        m.bindTooltip(`#${s.job_id} · stop ${s.seq + 1}`, { direction: "top" });
        m.bindPopup(stopPopup(s, rt.tech_name, color));
        hoverable(m, 4);
        bounds.push([s.y, s.x]);
      });
      bounds.push([rt.home_y, rt.home_x]);
    });

    const stopsByTech = new Map<string, number>();
    routes?.forEach((rt) => stopsByTech.set(rt.tech_name, rt.stops.length));

    technicians.forEach((t) => {
      const icon = L.divIcon({
        className: "",
        html: '<div style="width:12px;height:12px;background:var(--accent);transform:rotate(45deg);border:1px solid #06121f;box-shadow:0 0 5px rgba(0,0,0,.6)"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      const m = L.marker([t.home_y, t.home_x], { icon }).addTo(layer);
      m.bindTooltip(t.name, { direction: "top" });
      m.bindPopup(techPopup(t, stopsByTech.get(t.name)));
      bounds.push([t.home_y, t.home_x]);
    });

    if (bounds.length) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
  }, [ready, technicians, jobs, routes]);

  return (
    <div className="relative w-full h-full">
      <div ref={elRef} className="absolute inset-0 rounded-md overflow-hidden"
        style={{ background: "var(--panel-2)" }} />
      <div className="absolute z-[500] left-2 bottom-2 rounded-md px-2.5 py-2 text-[11px] space-y-1"
        style={{ background: "rgba(13,20,34,0.85)", border: "1px solid var(--border)", color: "var(--muted)" }}>
        <LegendRow color="#f43f5e" label="P1 critical" />
        <LegendRow color="#f59e0b" label="P2 high" />
        <LegendRow color="#38bdf8" label="P3 normal" />
        <LegendRow color="#94a3b8" label="P4 low" />
        <div className="flex items-center gap-1.5">
          <span style={{ width: 9, height: 9, background: "var(--accent)", transform: "rotate(45deg)", display: "inline-block" }} />
          tech base
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ width: 9, height: 9, borderRadius: 999, border: "2px solid #fff", display: "inline-block" }} />
          emergency
        </div>
      </div>
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span style={{ width: 9, height: 9, borderRadius: 999, background: color, display: "inline-block" }} />
      {label}
    </div>
  );
}
