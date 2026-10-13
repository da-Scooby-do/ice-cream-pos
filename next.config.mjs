import { dirname } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: root,
  // The laptop app ships Next's self-contained server (see scripts/prepare-desktop.mjs).
  ...(process.env.BUILD_TARGET === "desktop" ? { output: "standalone" } : {}),
  // lets a second dev server (cloud mode) run beside the desktop one
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  poweredByHeader: false,
  // no next/image in this app — keep sharp/typescript out of the desktop bundle
  images: { unoptimized: true },
  outputFileTracingExcludes: {
    "*": ["node_modules/@img/**", "node_modules/sharp/**", "node_modules/typescript/**"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
