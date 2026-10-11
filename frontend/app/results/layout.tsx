import type { Metadata } from "next";

// Each page canonicalizes to itself; the root layout's canonical covers "/".
export const metadata: Metadata = { alternates: { canonical: "/results/" } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
