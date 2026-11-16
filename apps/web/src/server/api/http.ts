/**
 * Shared plumbing for /api/v1 route handlers: uniform error format, CORS
 * (the widget is embedded on other origins), JSON/query validation and
 * per-client rate limiting.
 */
import type { z } from "zod";

export type ErrorCode =
  | "invalid_json"
  | "invalid_request"
  | "not_found"
  | "payload_too_large"
  | "rate_limited"
  | "internal_error";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Array<{ path: string; message: string }>,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

const MAX_BODY_BYTES = 64 * 1024;

export function json(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  return Response.json(body, {
    status: init.status ?? 200,
    headers: { ...CORS_HEADERS, "Cache-Control": "no-store", ...init.headers },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      { status: error.status, ...(error.headers ? { headers: error.headers } : {}) },
    );
  }
  console.error("[api] unhandled error", error);
  return json(
    { error: { code: "internal_error", message: "Something went wrong on our side." } },
    { status: 500 },
  );
}

/** Wrap a handler so every thrown error becomes a well-formed JSON error response. */
export function route<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** CORS preflight for every route. */
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function zodDetails(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join(".") || "(root)",
    message: issue.message,
  }));
}

export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.output<S>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES)
    throw new ApiError(413, "payload_too_large", "Request body is too large.");

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES)
    throw new ApiError(413, "payload_too_large", "Request body is too large.");

  let raw: unknown;
  try {
    raw = text.length === 0 ? {} : JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(
      400,
      "invalid_request",
      "Request body is invalid.",
      zodDetails(parsed.error),
    );
  }
  return parsed.data;
}

export function readQuery<S extends z.ZodType>(request: Request, schema: S): z.output<S> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    throw new ApiError(
      400,
      "invalid_request",
      "Query parameters are invalid.",
      zodDetails(parsed.error),
    );
  }
  return parsed.data;
}

/** Best-effort client id for rate limiting (first hop of x-forwarded-for on Vercel). */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "anonymous";
}

export function enforceRateLimit(allowed: boolean): void {
  if (!allowed) {
    throw new ApiError(
      429,
      "rate_limited",
      "Too many requests. Try again in a minute.",
      undefined,
      {
        "Retry-After": "60",
      },
    );
  }
}
