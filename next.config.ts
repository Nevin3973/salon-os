import type { NextConfig } from "next";
import path from "node:path";

const securityHeaders = [
  // Never render Salon OS inside someone else's frame (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Browsers must not guess content types.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak internal URLs to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // We don't use these browser features at all.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray lockfile exists in a parent dir).
  outputFileTracingRoot: path.join(__dirname),
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
