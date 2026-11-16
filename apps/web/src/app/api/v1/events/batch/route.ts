import { getContext } from "@/server/context";
import { json, readJson, route } from "@/server/api/http";
import { EventBatchRequestSchema } from "@/server/api/schemas";
import { recordEvents } from "@/server/services";

export { OPTIONS } from "@/server/api/http";

export const POST = route(async (request: Request) => {
  const { events } = await readJson(request, EventBatchRequestSchema);
  return json({ events: await recordEvents(getContext(), events) }, { status: 201 });
});
