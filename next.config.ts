import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is entirely client-side, so it builds to plain static files in out/.
  output: "export",
  // GitHub Pages serves a project site from /<repo-name>; the deploy workflow
  // passes that in. Unset locally, so dev and local builds stay at the root.
  basePath: process.env.PAGES_BASE_PATH || undefined,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
