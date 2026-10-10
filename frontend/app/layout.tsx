import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://dispatch.scottcampbell.io"),
  title: "Field Service Dispatch Optimizer: technician scheduling with OR-Tools",
  description:
    "Field service dispatch optimization demo. OR-Tools CP-SAT schedules technicians by skill, SLA window, travel and shift capacity, compared against a manual dispatch baseline.",
  applicationName: "Field Service Dispatch Optimizer",
  authors: [{ name: "Scott Campbell", url: "https://scottcampbell.io/" }],
  openGraph: {
    type: "website",
    siteName: "Field Service Dispatch Optimizer",
    title: "Field Service Dispatch Optimizer: technician scheduling with OR-Tools",
    description: "Field service dispatch optimization demo. OR-Tools CP-SAT schedules technicians by skill, SLA window, travel and shift capacity, compared against a manual dispatch baseline.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Field Service Dispatch Optimizer: technician scheduling with OR-Tools CP-SAT" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Field Service Dispatch Optimizer: technician scheduling with OR-Tools",
    description: "Field service dispatch optimization demo. OR-Tools CP-SAT schedules technicians by skill, SLA window, travel and shift capacity, compared against a manual dispatch baseline.",
    images: ["/og-image.png"],
  },
};

// Structured data for search engines.
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Field Service Dispatch Optimizer",
  "url": "https://dispatch.scottcampbell.io/",
  "description": "Field service dispatch optimization demo. OR-Tools CP-SAT schedules technicians by skill, SLA window, travel and shift capacity, compared against a manual dispatch baseline.",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Any (web browser)",
  "isAccessibleForFree": true,
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "author": {
    "@type": "Person",
    "name": "Scott Campbell",
    "url": "https://scottcampbell.io/"
  },
  "subjectOf": {
    "@type": "CreativeWork",
    "name": "Field Service Dispatch Optimizer case study",
    "url": "https://scottcampbell.io/projects/dispatch-optimizer/"
  },
  "sameAs": [
    "https://github.com/scottcampbelldata/field-service-dispatch-optimizer"
  ]
};

import { ThemeProvider } from "next-themes";
import { DispatchProvider } from "./providers";
import { Header } from "@/components/Header";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <DispatchProvider>
            <Header />
            <main className="flex-1">{children}</main>
            <footer className="border-t mt-8" style={{ borderColor: "var(--border)" }}>
              <div className="mx-auto max-w-7xl px-5 py-4 text-xs flex flex-wrap items-center justify-between gap-2"
                style={{ color: "var(--muted)" }}>
                <span>
                  Synthetic Dallas-Fort Worth field-service dataset - no real customer data.
                </span>
                <span>
                  OR-Tools CP-SAT optimization · technicians, skills, SLA windows, travel, and shift
                  capacity are seeded and reproducible.
                </span>
              </div>
            </footer>
          </DispatchProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
