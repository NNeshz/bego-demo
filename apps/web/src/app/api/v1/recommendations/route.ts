import { getContext } from "@/server/context";
import { clientKey, enforceRateLimit, json, readJson, route } from "@/server/api/http";
import { RecommendationsRequestSchema } from "@/server/api/schemas";
import { getRecommendations } from "@/server/services";

export { OPTIONS } from "@/server/api/http";

export const POST = route(async (request: Request) => {
  const ctx = getContext();
  const body = await readJson(request, RecommendationsRequestSchema);
  // Explanations may call the AI: those requests count against the per-client budget.
  if (body.explain) enforceRateLimit(ctx.clientLimiter.tryTake(clientKey(request)));
  return json(await getRecommendations(ctx, body));
});
