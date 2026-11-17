import { z } from "zod";
import {
  ApiError,
  clientKey,
  enforceRateLimit,
  errorResponse,
  json,
  readJson,
} from "@/server/api/http";
import { getContext } from "@/server/context";

const Body = z.object({ token: z.string().min(1).max(256) });

/**
 * Retrain proxy for /modelo. The admin types the token; this server only forwards it to
 * services/ml, which validates it. Nothing secret lives in the web app, so a visitor
 * can't trigger training by clicking a button.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = getContext();
    // Throttles brute-forcing the token as well as accidental double clicks.
    enforceRateLimit(ctx.clientLimiter.tryTake(`train:${clientKey(request)}`));
    const { token } = await readJson(request, Body);
    if (!ctx.weights.baseUrl)
      throw new ApiError(400, "invalid_request", "The ML service is not configured.");

    const response = await fetch(`${ctx.weights.baseUrl}/train`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(60_000),
    }).catch(() => null);
    if (!response) throw new ApiError(500, "internal_error", "The ML service did not respond.");

    const body = (await response.json().catch(() => ({}))) as {
      detail?: string;
      version?: number;
      published?: boolean;
    };
    if (!response.ok) {
      const message =
        response.status === 401
          ? "Token de admin incorrecto."
          : (body.detail ?? `ML service error ${response.status}`);
      return json(
        { error: { code: "invalid_request", message } },
        { status: response.status === 401 ? 401 : 400 },
      );
    }
    ctx.weights.invalidate();
    return json({ version: body.version, published: body.published });
  } catch (error) {
    return errorResponse(error);
  }
}
