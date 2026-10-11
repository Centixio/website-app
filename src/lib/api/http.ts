import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, type Session } from "@/lib/auth/session";
import { StoreError } from "@/lib/data/types";
import { env } from "@/lib/env";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function json(data: unknown, init?: number | ResponseInit) {
  const res = NextResponse.json(data, typeof init === "number" ? { status: init } : init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

const STORE_ERRORS: Record<StoreError["code"], [number, string]> = {
  not_found: [404, "Not found."],
  insufficient_credits: [402, "You don't have enough credits for this action."],
  concurrency_limit: [429, "You already have the maximum number of generations running. Wait for one to finish."],
  rate_limited: [429, "Too many generations in the last hour. Please try again later."],
  job_not_owned: [409, "This job is no longer active."],
  invalid: [400, "Invalid request."],
  conflict: [409, "Conflict."],
  setup_required: [503, "The database hasn't been set up yet. Apply the Supabase migrations (see /setup)."],
};

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) return json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
  if (err instanceof StoreError) {
    const [status, message] = STORE_ERRORS[err.code];
    return json({ error: { code: err.code, message: err.message && err.message !== err.code ? err.message : message } }, status);
  }
  if (err instanceof z.ZodError) return json({ error: { code: "invalid", message: "Invalid request.", details: err.issues.slice(0, 10) } }, 400);
  console.error("[api]", err);
  return json({ error: { code: "internal", message: "Something went wrong." } }, 500);
}

/**
 * Reject cross-site mutations. Browsers always send Origin on cross-site
 * POST/PUT/PATCH/DELETE; ours must match the request host (or the configured app URL).
 */
function checkOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients; auth still required
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let ok = false;
  try {
    const o = new URL(origin);
    ok = o.host === host || o.origin === new URL(env.appUrl()).origin;
  } catch {
    ok = false;
  }
  if (!ok) throw new HttpError(403, "forbidden", "Cross-site request blocked.");
}

type Handler<P> = (ctx: { req: Request; session: Session; params: P }) => Promise<Response>;

/** Wrap a route handler: same-origin check, authentication, error mapping. */
export function withSession<P = Record<string, string>>(handler: Handler<P>) {
  return async (req: Request, context: { params: Promise<P> }) => {
    try {
      checkOrigin(req);
      const session = await getSession();
      if (!session) throw new HttpError(401, "unauthorized", "Please sign in.");
      const params = context?.params ? await context.params : ({} as P);
      return await handler({ req, session, params });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be JSON.");
  }
  return schema.parse(data);
}

export const IdempotencyKey = z.string().min(8).max(100).regex(/^[A-Za-z0-9_\-:.]+$/);
export const Uuid = z.string().uuid();

export function requireUuid(value: string, what = "id"): string {
  if (!Uuid.safeParse(value).success) throw new HttpError(404, "not_found", `Unknown ${what}.`);
  return value;
}
