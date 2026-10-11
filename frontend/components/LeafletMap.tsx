"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
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
  /** Called once the default basemap has drawn its first full frame. */
  onBasemapReady?: () => void;
}

const ROUTE_HUES = [180, 150, 95, 45, 20, 320, 265, 210, 120, 0, 60, 290];
// Distinct from the teal job-clusters and the red/amber/blue/grey job dots.
const TECH_COLOR = "#8b5cf6";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function row(label: string, value: string) {
  return `<div class="row"><span>${label}</span><b>${value}</b></div>`;
}

function jobPopup(j: MapJob): string {
  const part = j.requires_part ? (j.part_available ? "in stock" : "missing") : "-";
  return `<div class="map-pop">
    <div class="map-pop-h">
      <span class="dot" style="background:${priorityColor(j.priority)}"></span>
      Job #${esc(j.id)} ${j.is_emergency ? '<span class="badge-em">EMERGENCY</span>' : ""}
    </div>
    ${row("Status", '<span style="color:var(--text-faint)">Unassigned</span>')}
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
    ? `${hhmm(t.shift_start)}-${hhmm(t.shift_end)}` : "-";
  // No route attached => board/input view: this marker is just the crew's
  // home base, nothing is assigned yet. Make that explicit so the diamond
  // sitting amid a job cluster doesn't read as "this tech owns these calls".
  const onBoard = stops == null;
  return `<div class="map-pop">
    <div class="map-pop-h">
      <span class="dot" style="background:${TECH_COLOR}"></span> ${esc(t.name)}${onBoard ? " · Home base" : ""}
    </div>
    ${t.skills?.length ? row("Skills", esc(t.skills.join(", "))) : ""}
    ${row("Shift", shift)}
    ${stops != null ? row("Jobs on route", String(stops)) : ""}
    ${stops != null ? '<div class="map-pop-hint">click route to isolate</div>' : ""}
    ${onBoard ? '<div class="map-pop-hint">Daily start/end location, not assigned work. Run the optimizer to assign jobs.</div>' : ""}
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
    ${row("Window", `${hhmm(s.start)}-${hhmm(s.end)}`)}
  </div>`;
}

// One marker for several jobs serviced at the same site: header names the
// site + stop count, then one line per job (sequence, id, skill, window).
function multiStopPopup(stops: Route["stops"], techName: string, color: string): string {
  const lines = stops.map((s) => {
    const flags = [
      s.is_sla_breach ? '<span class="badge-em">SLA</span>' : "",
      s.is_overtime ? '<span class="badge-em" style="background:var(--warn)">OT</span>' : "",
    ].join(" ");
    return `<div class="row"><span>Stop ${s.seq + 1} · #${esc(s.job_id)} · ${esc(s.required_skill)}</span>` +
      `<b>${hhmm(s.start)}-${hhmm(s.end)} ${flags}</b></div>`;
  }).join("");
  return `<div class="map-pop">
    <div class="map-pop-h">
      <span class="dot" style="background:${color}"></span> ${esc(stops[0].site_name)} · ${stops.length} stops
    </div>
    ${row("Technician", esc(techName))}
    ${lines}
  </div>`;
}

// Compress a sorted-ascending list of stop numbers into ranges: [1,2,3,5] -> "1-3,5".
function formatSeqRange(nums: number[]): string {
  const xs = [...nums].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = xs[0], prev = xs[0];
  for (let i = 1; i <= xs.length; i++) {
    if (i < xs.length && xs[i] === prev + 1) { prev = xs[i]; continue; }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    if (i < xs.length) { start = xs[i]; prev = xs[i]; }
  }
  return parts.join(",");
}

// OpenFreeMap style, fetched here rather than by MapLibre so a few filters
// can be made null-safe. Some compare a feature property such as `rank` or
// `ref_length` with a number, and features without that property log a
// warning per tile. MapLibre already treats those as not matching; giving the
// missing value a default on the failing side keeps that result, quietly.
// Falls back to the style URL if the fetch fails.
const FAIL_LOW = { "<": 1e9, "<=": 1e9, ">": -1e9, ">=": -1e9 } as const;
async function loadStyle(name: string): Promise<unknown> {
  const url = `https://tiles.openfreemap.org/styles/${name}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const style = await res.json();
    const fix = (node: unknown): unknown => {
      if (!Array.isArray(node)) return node;
      const [op, left, right] = node;
      if (op in FAIL_LOW && node.length === 3 && typeof right === "number"
        && Array.isArray(left) && left[0] === "get" && left.length === 2) {
        return [op, ["coalesce", left, FAIL_LOW[op as keyof typeof FAIL_LOW]], right];
      }
      return node.map(fix);
    };
    for (const layer of style.layers ?? []) {
      if (layer.filter) layer.filter = fix(layer.filter);
    }
    return style;
  } catch {
    return url;
  }
}

// The MapLibre plugin queues a frame on zoom-transition end that reads its
// Leaflet map; if the map was removed in between (leaving a page mid-zoom)
// that read throws. Same steps as the plugin, skipped once the layer is gone.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function guardPluginAfterRemove(L: any) {
  const proto = L.MaplibreGL?.prototype;
  if (!proto || proto.__guarded) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proto._transitionEnd = function (this: any) {
    L.Util.requestAnimFrame(() => {
      if (!this._map || !this._glMap) return;
      const zoom = this._map.getZoom();
      const center = this._map.getCenter();
      const offset = this._map.latLngToContainerPoint(this._map.getBounds().getNorthWest());
      this._resizeContainer();
      L.DomUtil.setTransform(this._glMap._actualCanvas, offset, 1);
      this._glMap.once("moveend", () => { if (this._map) this._zoomEnd(); });
      this._glMap.jumpTo({ center, zoom: zoom - 1 });
    });
  };
  proto.__guarded = true;
}

// Coordinates are [lon=x, lat=y]; Leaflet wants [lat, lon].
export default function LeafletMap({ technicians, jobs, routes, onBasemapReady }: Props) {
  const readyCbRef = useRef(onBasemapReady);
  useEffect(() => { readyCbRef.current = onBasemapReady; }, [onBasemapReady]);
  const elRef = useRef<HTMLDivElement>(null);
  const routesPanelRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  // On phones the legend and route list start folded so they do not cover
  // the map. This component only renders in the browser (ssr: false).
  const [narrow] = useState(() => window.matchMedia("(max-width: 639px)").matches);
  const [routesOpen, setRoutesOpen] = useState(!narrow);
  const [legendOpen, setLegendOpen] = useState(!narrow);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ro: any;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet.markercluster");
      if (!active || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, { zoomControl: true, maxZoom: 19 });
      mapRef.current = map;
      const ofmAttribution =
        '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
        '&copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> ' +
        'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
      // Credit and the layer switcher go in before the basemap arrives, so
      // the bottom-right corner does not grow and shift once it loads.
      map.attributionControl.addAttribution(ofmAttribution);
      const switcher = L.control.layers(
        {}, {}, { position: "bottomright", collapsed: true },
      ).addTo(map);

      // Keyless vector basemaps from OpenFreeMap (OpenStreetMap data, no
      // account or key), drawn with MapLibre inside Leaflet so markers,
      // clusters and routes stay as they are. MapLibre and its CSS are
      // imported here, so they only download once the map is mounted.
      const [, , libertyStyle, darkStyle] = await Promise.all([
        import("maplibre-gl/dist/maplibre-gl.css"),
        import("@maplibre/maplibre-gl-leaflet"),
        loadStyle("liberty"),
        loadStyle("dark"),
      ]);
      if (!active) return;
      guardPluginAfterRemove(L);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gl = (style: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const layer = (L as any).maplibreGL({
          style,
          // A fixed credit string, so the plugin does not swap in the
          // tileset's own text after the style loads and shift the corner.
          attributionControl: { customAttribution: ofmAttribution },
        });
        // A few icons named in the styles are not in their sprite sheets;
        // stand in a blank image so MapLibre does not warn about each one.
        layer.on("add", () => {
          const glMap = layer.getMaplibreMap?.();
          glMap?.on("styleimagemissing", (e: { id: string }) => {
            if (!glMap.hasImage(e.id)) glMap.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
          });
        });
        return layer;
      };
      const streets = gl(libertyStyle);
      const dark = gl(darkStyle);
      // Default basemap follows the app theme (Dark tiles in dark mode).
      const isDark = document.documentElement.classList.contains("dark");
      const base = isDark ? dark : streets;
      base.addTo(map);
      switcher.addBaseLayer(streets, "Streets");
      switcher.addBaseLayer(dark, "Dark");
      // The base layers carry the same credit now, so drop the placeholder.
      map.attributionControl.removeAttribution(ofmAttribution);

      map.setView([32.85, -96.75], 11);

      // Tell the wrapper when the basemap has finished drawing, so it can
      // fade out the static preview. A timer covers a stalled tile server.
      let announced = false;
      const announce = () => {
        if (announced || !active) return;
        announced = true;
        readyCbRef.current?.();
      };
      base.getMaplibreMap?.()?.once("idle", announce);
      setTimeout(announce, 6000);

      // Dedicated high-z pane so technician bases always sit above job markers
      // and clusters (their home bases share coordinates with job sites, so
      // otherwise they get covered, especially when zoomed in).
      // Above job markers (markerPane 600) and clusters, but below Leaflet's
      // tooltipPane (650) and popupPane (700) so popups/tooltips never hide
      // behind a technician diamond.
      const techPane = map.createPane("techPane");
      techPane.style.zIndex = "620";
      // Route stop markers sit just above the tech bases (but below tooltips/
      // popups) so a numbered stop is never hidden under a home-base diamond
      // it shares coordinates with.
      const stopPane = map.createPane("stopPane");
      stopPane.style.zIndex = "630";

      layerRef.current = L.layerGroup().addTo(map);
      LRef.current = L;
      ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(elRef.current);
      setTimeout(() => active && map.invalidateSize(), 120);
      setReady(true);
    })();
    return () => {
      active = false;
      if (ro) ro.disconnect();
      const map = mapRef.current;
      if (map) {
        // Stop any running fitBounds animation and take the MapLibre layers
        // off first, so nothing queued by them runs against a removed map.
        map.stop();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.eachLayer((l: any) => { if (l.getMaplibreMap) map.removeLayer(l); });
        map.remove();
      }
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
    const hasRoutes = !!routes?.length;

    // --- standalone jobs (board): clustered ---
    if (jobs?.length && !hasRoutes) {
      const cluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 45,
        spiderfyDistanceMultiplier: 1.6,
        spiderLegPolylineOptions: { weight: 1, color: "var(--text-faint)", opacity: 0.35 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        iconCreateFunction: (c: any) => L.divIcon({
          className: "",
          html: `<div class="cluster">${c.getChildCount()}</div>`,
          iconSize: [34, 34],
        }),
      });
      jobs.forEach((j) => {
        const r = j.priority === 1 ? 6 : j.priority === 2 ? 5 : 4;
        const color = priorityColor(j.priority);
        const m = L.circleMarker([j.y, j.x], {
          radius: r, color: j.is_emergency ? "#ffffff" : color,
          weight: j.is_emergency ? 2 : 1, fillColor: color, fillOpacity: 0.8,
        });
        m.bindTooltip(`#${j.id ?? ""} · ${j.required_skill ?? ""}`, { direction: "top" });
        m.bindPopup(jobPopup(j));
        m.on("mouseover", () => m.setRadius(r + 3));
        m.on("mouseout", () => m.setRadius(r));
        cluster.addLayer(m);
        bounds.push([j.y, j.x]);
      });
      layer.addLayer(cluster);
    }

    // --- routes: polylines + numbered stops, with click-to-isolate ---
    routes?.forEach((rt, i) => {
      const color = `hsl(${ROUTE_HUES[i % ROUTE_HUES.length]} 80% 60%)`;
      const isSel = selected === rt.tech_id;
      const dim = selected !== null && !isSel;

      const pts: [number, number][] = [
        [rt.home_y, rt.home_x],
        ...rt.stops.map((s) => [s.y, s.x] as [number, number]),
        [rt.home_y, rt.home_x],
      ];
      const line = L.polyline(pts, {
        color, weight: isSel ? 4 : 2, opacity: dim ? 0.1 : 0.85,
      }).addTo(layer);
      line.on("click", () => setSelected((p) => (p === rt.tech_id ? null : rt.tech_id)));

      if (!dim) {
        // Several jobs can sit at the same site (up to 8 in this dataset), so
        // multiple stops share one coordinate. Stacked markers overlap and
        // hide each other, so collapse co-located stops into a single marker
        // that shows the whole visit sequence (e.g. "1-2") and lists every job
        // in its popup. One location => one marker => nothing can be hidden.
        const groups = new Map<string, Route["stops"]>();
        rt.stops.forEach((s) => {
          const k = `${s.x},${s.y}`;
          (groups.get(k) ?? groups.set(k, []).get(k)!).push(s);
        });
        groups.forEach((group) => {
          const ordered = [...group].sort((a, b) => a.seq - b.seq);
          const first = ordered[0];
          const multi = ordered.length > 1;
          const label = formatSeqRange(ordered.map((s) => s.seq + 1));
          const icon = L.divIcon({
            className: "route-stop-wrap",
            html: `<div class="route-stop${multi ? " multi" : ""}" style="background:${color}">${label}</div>`,
            iconSize: [20, 20], iconAnchor: [10, 10],
          });
          const m = L.marker([first.y, first.x], { icon, pane: "stopPane", title: multi ? `${ordered.length} stops at ${first.site_name}` : `Job ${first.job_id}, stop ${label}` }).addTo(layer);
          m.bindTooltip(multi ? `${ordered.length} stops · ${first.site_name}` : `#${first.job_id} · stop ${label}`,
            { direction: "top" });
          m.bindPopup(multi ? multiStopPopup(ordered, rt.tech_name, color) : stopPopup(first, rt.tech_name, color));
        });
        if (isSel || selected === null) pts.forEach((p) => bounds.push(p));
      }
    });

    // --- technician home bases (always shown) ---
    const stopsByTech = new Map<string, number>();
    routes?.forEach((rt) => stopsByTech.set(rt.tech_name, rt.stops.length));
    // When a route is isolated, fade the other crews' home bases so the
    // selected route's stops read clearly instead of competing with a dozen
    // diamonds.
    const selectedTechName = selected != null
      ? routes?.find((rt) => rt.tech_id === selected)?.tech_name ?? null
      : null;
    technicians.forEach((t) => {
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:16px;height:16px;background:${TECH_COLOR};transform:rotate(45deg);border:2px solid #fff;box-shadow:0 0 5px rgba(0,0,0,.55)"></div>`,
        iconSize: [16, 16], iconAnchor: [8, 8],
      });
      const m = L.marker([t.home_y, t.home_x], { icon, pane: "techPane", riseOnHover: true, title: `${t.name} home base` }).addTo(layer);
      if (selectedTechName != null && t.name !== selectedTechName) m.setOpacity(0.25);
      m.bindTooltip(`${t.name}${hasRoutes ? "" : " · home base"}`, { direction: "top" });
      m.bindPopup(techPopup(t, stopsByTech.get(t.name)));
      if (!hasRoutes || selected === null) bounds.push([t.home_y, t.home_x]);
    });

    // Auto-fit must not frame stops underneath the HTML overlays. Measure the
    // actual overlay rects so we reserve exactly the space they occupy: the
    // Routes legend (top-right) reserves the right edge, the priority legend
    // (bottom-left, plus the bottom-right layers control) reserves the bottom.
    // Clamped to 45% per axis so a tight route never collapses to a sliver.
    if (bounds.length) {
      const cont = elRef.current?.getBoundingClientRect();
      const padTop = 24, padLeft = 24;
      let padRight = 24, padBottom = 56;
      if (cont) {
        const rp = routesPanelRef.current?.getBoundingClientRect();
        if (rp) padRight = Math.min(cont.width * 0.45, Math.max(padRight, cont.right - rp.left + 12));
        const lg = legendRef.current?.getBoundingClientRect();
        if (lg) padBottom = Math.min(cont.height * 0.45, Math.max(padBottom, cont.bottom - lg.top + 12));
      }
      map.fitBounds(bounds, {
        paddingTopLeft: [padLeft, padTop],
        paddingBottomRight: [padRight, padBottom],
        maxZoom: 14,
      });
    }
  }, [ready, technicians, jobs, routes, selected]);

  return (
    <div className="relative w-full h-full">
      <div ref={elRef} className="absolute inset-0 rounded-md overflow-hidden"
        style={{ background: "var(--panel-2)" }} />

      {/* Interactive route legend: click a tech to isolate its route. Mirrors
          clicking the polyline, but discoverable and precise where the lines
          overlap. Selection is shared state, so map and legend stay in sync. */}
      {!!routes?.length && (
        <div ref={routesPanelRef} className="absolute z-[600] right-2 top-2 w-44 rounded-md text-[11px]"
          style={{ background: "color-mix(in srgb, var(--surface-1) 92%, transparent)", border: "1px solid var(--border)", backdropFilter: "blur(4px)" }}>
          <div className="flex items-center justify-between gap-2 px-2 pt-1.5 pb-1">
            <button onClick={() => setRoutesOpen((o) => !o)} className="flex items-center gap-1 font-medium"
              style={{ color: "var(--text-muted)" }} title={routesOpen ? "Collapse" : "Expand"}>
              <span style={{ display: "inline-block", transition: "transform .15s ease", transform: routesOpen ? "rotate(90deg)" : "none" }}>▸</span>
              Routes
              <span className="mono" style={{ color: "var(--text-faint)" }}>({routes.length})</span>
            </button>
            {selected !== null && (
              <button onClick={() => setSelected(null)} className="font-medium" style={{ color: "var(--accent)" }}>
                Show all
              </button>
            )}
          </div>
          {routesOpen && (
          <div className="max-h-[190px] overflow-auto px-1 pb-1 space-y-0.5">
            {routes.map((rt, i) => {
              const color = `hsl(${ROUTE_HUES[i % ROUTE_HUES.length]} 80% 60%)`;
              const isSel = selected === rt.tech_id;
              const dim = selected !== null && !isSel;
              return (
                <button key={rt.tech_id}
                  onClick={() => setSelected((p) => (p === rt.tech_id ? null : rt.tech_id))}
                  title={`${rt.tech_name} · ${rt.stops.length} stop${rt.stops.length === 1 ? "" : "s"}`}
                  className="flex items-center gap-1.5 w-full text-left rounded px-1.5 py-0.5"
                  style={{ background: isSel ? "color-mix(in srgb, var(--accent) 18%, transparent)" : "transparent", opacity: dim ? 0.55 : 1 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block", flex: "0 0 auto" }} />
                  <span className="truncate" style={{ color: "var(--text-muted)" }}>{rt.tech_name}</span>
                  <span className="ml-auto mono" style={{ color: "var(--text-faint)" }}>{rt.stops.length}</span>
                </button>
              );
            })}
          </div>
          )}
        </div>
      )}

      <div ref={legendRef} className="absolute z-[500] left-2 bottom-2 rounded-md px-2.5 py-2 text-[11px] space-y-1"
        style={{ background: "color-mix(in srgb, var(--surface-1) 90%, transparent)", border: "1px solid var(--border)", color: "var(--text-muted)", backdropFilter: "blur(4px)" }}>
        {narrow && (
          <button type="button" onClick={() => setLegendOpen((o) => !o)} aria-expanded={legendOpen}
            className="flex items-center gap-1 font-medium" style={{ color: "var(--text)" }}>
            Legend <span aria-hidden>{legendOpen ? "▾" : "▸"}</span>
          </button>
        )}
        {legendOpen && (
          <>
            <LegendRow color="#f43f5e" label="P1 critical" />
            <LegendRow color="#f59e0b" label="P2 high" />
            <LegendRow color="#38bdf8" label="P3 normal" />
            <LegendRow color="#94a3b8" label="P4 low" />
            <div style={{ borderTop: "1px solid var(--border)", margin: "3px 0" }} />
            <div className="flex items-center gap-1.5">
              <span style={{ width: 10, height: 10, background: TECH_COLOR, transform: "rotate(45deg)", display: "inline-block", border: "1px solid #fff" }} />
              tech home base
            </div>
            {routes?.length ? (
              <div className="pt-1" style={{ color: "var(--accent)" }}>click a route or list row to isolate</div>
            ) : (
              <div className="pt-1" style={{ color: "var(--text-faint)" }}>backlog by site location · optimize to assign</div>
            )}
          </>
        )}
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
