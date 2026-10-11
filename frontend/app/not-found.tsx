import type { Metadata } from "next";
import Link from "next/link";

// Next already marks the 404 noindex; this stops it inheriting the home
// page's canonical link from the root layout.
export const metadata: Metadata = {
  title: "Page not found",
  alternates: { canonical: null },
};

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="panel p-6">
        <h1 className="font-semibold text-lg">Page not found</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          There is nothing at this address. <Link href="/" className="underline">Back to the dispatch board</Link>.
        </p>
      </div>
    </div>
  );
}
