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

const WAKE_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
// Fallback for a visitor who loads the page and does nothing at all.
const IDLE_FALLBACK_MS = 5000;

// The map code (Leaflet, clustering, MapLibre) is the heaviest JS on the
// page, so it waits until the page has loaded, the visitor has moved, scrolled
// or typed (or a few seconds have passed), and the map is near the viewport.
// The slot fills its parent, which reserves the space, so nothing moves when
// the map arrives.
export default function MapView(props: ComponentProps<typeof LeafletMap>) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [awake, setAwake] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (awake) return;
    let timer: number | undefined;
    const wake = () => setAwake(true);
    const opts = { passive: true, once: true } as const;
    const start = () => {
      WAKE_EVENTS.forEach((t) => window.addEventListener(t, wake, opts));
      timer = window.setTimeout(wake, IDLE_FALLBACK_MS);
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      window.removeEventListener("load", start);
      WAKE_EVENTS.forEach((t) => window.removeEventListener(t, wake));
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [awake]);

  useEffect(() => {
    const el = slotRef.current;
    if (!el || !awake || show) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        setShow(true);
      }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [awake, show]);

  return (
    <div ref={slotRef} data-map-slot className="w-full h-full">
      {show ? <LeafletMap {...props} /> : <Placeholder />}
    </div>
  );
}
