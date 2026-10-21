import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack auto-detects the project root by walking up for a lockfile,
  // and warns if it finds more than one (e.g. another package-lock.json
  // somewhere above this repo on a given machine). Pin it explicitly so
  // that ambiguity can't happen regardless of what's above this checkout.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
