"use client";

import Link from "next/link";
import { useDispatch } from "@/app/providers";

export function EmptyState({ title }: { title: string }) {
  const { loading, runOptimize } = useDispatch();
  return (
    <div className="mx-auto max-w-2xl p-10 text-center space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p style={{ color: "var(--muted)" }}>
        Run the optimizer first — set a scenario on the Dispatch Board, or solve with
        the current defaults right here.
      </p>
      <div className="flex gap-3 justify-center">
        <button onClick={() => runOptimize()} disabled={loading}
          className="rounded-md px-4 py-2 font-semibold"
          style={{ background: "var(--accent)", color: "#06202b", opacity: loading ? 0.6 : 1 }}>
          {loading ? "Solving…" : "Optimize with defaults"}
        </button>
        <Link href="/" className="rounded-md px-4 py-2"
          style={{ border: "1px solid var(--border)", color: "var(--muted)" }}>
          Go to Dispatch Board
        </Link>
      </div>
    </div>
  );
}
