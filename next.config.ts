import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["dev.kplfantasy.kz", "localhost"],
};

export default nextConfig;

