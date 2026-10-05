import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep isolated authenticated verification separate from the developer's dev server.
  distDir: process.env.OWNLINE_VERIFY_DIST_DIR ?? ".next",
  output: "export",
  allowedDevOrigins: ["127.0.0.1"],
  images: { unoptimized: true },
  turbopack: { root: process.cwd() },
};

export default nextConfig;
