import { connection } from "next/server";
import { z } from "zod";
import { getContext } from "@/server/context";
import { json, readJson, readQuery, route } from "@/server/api/http";
import { EventRequestSchema } from "@/server/api/schemas";
import { listEvents, recordEvent } from "@/server/services";

export { OPTIONS } from "@/server/api/http";

export const POST = route(async (request: Request) => {
  const body = await readJson(request, EventRequestSchema);
  return json(await recordEvent(getContext(), body), { status: 201 });
});

const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

export const GET = route(async (request: Request) => {
  await connection();
  const { limit } = readQuery(request, ListQuery);
  return json({ events: await listEvents(getContext(), limit) });
});
