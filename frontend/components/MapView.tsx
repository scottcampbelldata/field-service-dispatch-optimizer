"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ComponentProps } from "react";

// Leaflet touches `window`, so it must load client-only (ssr: false), which is
// only allowed inside a Client Component, hence this thin wrapper.
const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false });

const ATTRIBUTION = (
  <>
    <a href="https://leafletjs.com" title="A JavaScript library for interactive maps">
      <svg aria-hidden="true" width="12" height="8" viewBox="0 0 12 8" className="map-preview-flag">
        <path fill="#4C7BE1" d="M0 0h12v4H0z" /><path fill="#FFD500" d="M0 4h12v3H0z" /><path fill="#E0BC00" d="M0 7h12v1H0z" />
      </svg>{" "}Leaflet
    </a>
    {" | "}
    <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>
    {" © "}
    <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a>
    {" Data from "}
    <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
  </>
);

// A still of the default map view (same basemap, centre and zoom, markers
// left out), shown at the map's exact size until the live map has drawn.
function Preview({ hidden }: { hidden: boolean }) {
  const sizes = "(min-width: 1024px) 860px, 100vw";
  return (
    <div className="map-preview absolute inset-0 rounded-md overflow-hidden"
      style={{
        background: "var(--panel-2)",
        opacity: hidden ? 0 : 1,
        transition: "opacity 250ms ease",
        pointerEvents: hidden ? "none" : undefined,
        zIndex: 1000,
      }}>
      {/* Plain img on purpose: the site is a static export with no image
          optimiser, and these files are already sized and compressed. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="map-preview-light w-full h-full object-cover" alt=""
        src="/map/map-light-640.webp"
        srcSet="/map/map-light-640.webp 640w, /map/map-light-960.webp 960w"
        sizes={sizes} width={960} height={600} decoding="async" loading="lazy" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="map-preview-dark w-full h-full object-cover" alt=""
        src="/map/map-dark-640.webp"
        srcSet="/map/map-dark-640.webp 640w, /map/map-dark-960.webp 960w"
        sizes={sizes} width={960} height={600} decoding="async" loading="lazy" />
      <div className="map-preview-attribution">{ATTRIBUTION}</div>
    </div>
  );
}

type RIC = (cb: () => void, opts?: { timeout: number }) => number;

// The map code (Leaflet, clustering, MapLibre) is the heaviest JS on the
// page. If the map starts in or near the first screen it loads right after
// first paint; otherwise it loads when it comes within 200px of the screen.
// The preview fills the same box the whole time, so nothing moves.
export default function MapView(props: Omit<ComponentProps<typeof LeafletMap>, "onBasemapReady">) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [mount, setMount] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [previewGone, setPreviewGone] = useState(false);

  // Once the live map has drawn, fade the preview, then drop it from the
  // page so its links are not left behind as hidden focus targets.
  useEffect(() => {
    if (!drawn) return;
    const t = window.setTimeout(() => setPreviewGone(true), 300);
    return () => clearTimeout(t);
  }, [drawn]);

  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    const margin = 200;
    const r = el.getBoundingClientRect();
    const nearFirstScreen = r.top < window.innerHeight + margin && r.bottom > -margin;
    if (nearFirstScreen) {
      const w = window as Window & { requestIdleCallback?: RIC; cancelIdleCallback?: (n: number) => void };
      let cancel = () => {};
      // Two frames so the first paint has happened, then the next idle slot.
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
        if (w.requestIdleCallback && w.cancelIdleCallback) {
          const id = w.requestIdleCallback(() => setMount(true), { timeout: 300 });
          cancel = () => w.cancelIdleCallback?.(id);
        } else {
          const id = window.setTimeout(() => setMount(true), 50);
          cancel = () => clearTimeout(id);
        }
      }));
      return () => { cancelAnimationFrame(raf); cancel(); };
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        setMount(true);
      }
    }, { rootMargin: `${margin}px` });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={slotRef} data-map-slot className="relative w-full h-full">
      {mount && <LeafletMap {...props} onBasemapReady={() => setDrawn(true)} />}
      {!previewGone && <Preview hidden={drawn} />}
    </div>
  );
}
