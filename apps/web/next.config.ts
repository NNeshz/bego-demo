import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Internal workspace packages ship TypeScript source; Next transpiles them.
  transpilePackages: ["@retorno/engine", "@retorno/ai", "@retorno/db"],
  async headers() {
    return [
      {
        // Embedded on third-party sites: short cache so fixes roll out fast, CORS for module/fetch loaders.
        source: "/widget.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300, stale-while-revalidate=86400" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
    ];
  },
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
