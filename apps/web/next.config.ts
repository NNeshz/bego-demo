import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Internal workspace packages ship TypeScript source; Next transpiles them.
  transpilePackages: ["@retorno/engine", "@retorno/ai", "@retorno/db"],
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
