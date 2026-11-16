import { json, route } from "@/server/api/http";
import { buildOpenApiDocument } from "@/server/api/openapi";

export { OPTIONS } from "@/server/api/http";

// Generated from the Zod schemas; cacheable by clients for 5 minutes.
export const GET = route(async () =>
  json(buildOpenApiDocument(), { headers: { "Cache-Control": "public, max-age=300" } }),
);
