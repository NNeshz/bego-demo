import { getContext } from "@/server/context";
import { clientKey, enforceRateLimit, json, readJson, route } from "@/server/api/http";
import { ChainsRequestSchema } from "@/server/api/schemas";
import { getChains } from "@/server/services";

export { OPTIONS } from "@/server/api/http";

export const POST = route(async (request: Request) => {
  const ctx = getContext();
  const body = await readJson(request, ChainsRequestSchema);
  if (body.explain) enforceRateLimit(ctx.clientLimiter.tryTake(clientKey(request)));
  return json(await getChains(ctx, body));
});
