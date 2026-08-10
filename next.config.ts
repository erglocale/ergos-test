import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy the analytics API through the Next server so live-data fetches are
  // same-origin: immune to CORS and to ad blockers that kill cross-origin
  // requests to *analytics* hostnames. The real URL stays in .env.local.
  async rewrites() {
    const rules = [];
    const analytics = process.env.NEXT_PUBLIC_ANALYTICS_API;
    if (analytics) {
      rules.push({ source: "/live-api/:path*", destination: `${analytics}/:path*` });
    }
    // energy-brain is proxied by the /energy-api route handler instead of a
    // rewrite: FastAPI's trailing-slash redirects must be followed server-side.
    return rules;
  },
};

export default nextConfig;
