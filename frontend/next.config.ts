import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for Cloudflare Pages (matches the other portfolio apps).
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
