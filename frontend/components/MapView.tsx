"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ComponentProps } from "react";

// Leaflet touches `window`, so it must load client-only (ssr: false), which is
// only allowed inside a Client Component, hence this thin wrapper.
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <Placeholder />,
});

function Placeholder() {
  return (
    <div className="w-full h-full grid place-items-center rounded-md text-sm"
      style={{ background: "var(--panel-2)", color: "var(--muted)" }}>
      loading map…
    </div>
  );
}

// The map code (Leaflet, clustering, MapLibre) is the heaviest JS on the
// page, so it waits until the page has loaded and the map is near the
// viewport. The slot fills its parent, which reserves the space, so nothing
// moves when the map arrives.
export default function MapView(props: ComponentProps<typeof LeafletMap>) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = slotRef.current;
    if (!el || show) return;
    let io: IntersectionObserver | undefined;
    let idle: number | undefined;
    const watch = () => {
      io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io?.disconnect();
          setShow(true);
        }
      }, { rootMargin: "200px" });
      io.observe(el);
    };
    const afterLoad = () => {
      const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) idle = ric(watch, { timeout: 2000 });
      else idle = window.setTimeout(watch, 200);
    };
    if (document.readyState === "complete") afterLoad();
    else window.addEventListener("load", afterLoad, { once: true });
    return () => {
      window.removeEventListener("load", afterLoad);
      io?.disconnect();
      if (idle !== undefined) {
        const cic = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
        if (cic) cic(idle); else clearTimeout(idle);
      }
    };
  }, [show]);

  return (
    <div ref={slotRef} data-map-slot className="w-full h-full">
      {show ? <LeafletMap {...props} /> : <Placeholder />}
    </div>
  );
}
