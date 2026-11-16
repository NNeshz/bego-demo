import { connection } from "next/server";
import { getContext } from "@/server/context";
import { json, route } from "@/server/api/http";
import { API_VERSION } from "@/server/api/openapi";

export { OPTIONS } from "@/server/api/http";

export const GET = route(async () => {
  await connection();
  const ctx = getContext();
  return json({
    status: "ok",
    dataSource: ctx.data.kind,
    aiEnabled: ctx.ai.aiEnabled,
    version: API_VERSION,
  });
});
