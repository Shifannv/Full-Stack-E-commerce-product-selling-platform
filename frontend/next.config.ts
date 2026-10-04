import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  allowedDevOrigins: ["127.0.0.1"],
  images: { unoptimized: true },
  turbopack: { root: process.cwd() },
};

export default nextConfig;
