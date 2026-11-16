import { getContext } from "@/server/context";
import { clientKey, enforceRateLimit, json, readJson, route } from "@/server/api/http";
import { ParseTripRequestSchema } from "@/server/api/schemas";
import { parseTrip } from "@/server/services";

export { OPTIONS } from "@/server/api/http";

export const POST = route(async (request: Request) => {
  const ctx = getContext();
  const body = await readJson(request, ParseTripRequestSchema);
  enforceRateLimit(ctx.clientLimiter.tryTake(clientKey(request)));
  return json(
    await parseTrip(ctx, body.text, { previous: body.previous, expecting: body.expecting }),
  );
});
