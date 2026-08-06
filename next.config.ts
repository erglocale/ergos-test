import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy the analytics API through the Next server so live-data fetches are
  // same-origin: immune to CORS and to ad blockers that kill cross-origin
  // requests to *analytics* hostnames. The real URL stays in .env.local.
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_ANALYTICS_API;
    if (!api) return [];
    return [{ source: "/live-api/:path*", destination: `${api}/:path*` }];
  },
};

export default nextConfig;
