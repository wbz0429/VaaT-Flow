/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

const isDesktop = process.env.BUILD_TARGET === "desktop";

/** @type {import("next").NextConfig} */
const config = {
  devIndicators: false,
  // Desktop mode: standalone output — bundles a minimal Node.js server
  // that Tauri launches as a sidecar alongside the Python backend.
  // Static export (output:'export') is incompatible with dynamic routes.
  ...(isDesktop
    ? {
        output: "standalone",
        images: { unoptimized: true },
      }
    : {}),
};

export default config;
