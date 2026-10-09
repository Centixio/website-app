import "server-only";
import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * Signed cookie session for local demo mode only (no Supabase configured).
 * Never used when Supabase is configured.
 */
export const DEMO_COOKIE = "cx_demo_session";
const TTL_SECONDS = 60 * 60 * 24 * 14;

let devSecret: string | null = null;
export function demoSecret(): string {
  const configured = env.demoSecret();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("DEMO_SESSION_SECRET is required for demo mode in production");
  // Stable for the life of the dev server process.
  devSecret ??= crypto.randomBytes(32).toString("hex");
  return devSecret;
}

export function hmac(data: string): string {
  return crypto.createHmac("sha256", demoSecret()).update(data).digest("base64url");
}

export interface DemoSession {
  userId: string;
  email: string;
  exp: number;
}

export function signDemoSession(session: Omit<DemoSession, "exp">): string {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS })).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

export function verifyDemoSession(token: string | undefined): DemoSession | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = hmac(payload);
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as DemoSession;
    if (s.exp < Date.now() / 1000) return null;
    return s;
  } catch {
    return null;
  }
}

export const DEMO_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: TTL_SECONDS,
};

export function demoUserIdForEmail(email: string): string {
  // Deterministic UUID-shaped id so the same demo email maps to the same local data.
  const h = crypto.createHash("sha256").update(`centixio-demo:${email.toLowerCase()}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
