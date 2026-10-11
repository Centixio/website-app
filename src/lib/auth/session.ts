import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { appMode } from "@/lib/env";
import { createSupabaseServerClient, supabaseAdmin } from "@/lib/supabase/server";
import { DEMO_COOKIE, verifyDemoSession } from "./demo-session";
import { SupabaseUserStore, databaseReady } from "@/lib/data/supabase-store";
import { DemoUserStore } from "@/lib/data/demo-store";
import type { UserStore } from "@/lib/data/types";

export interface SessionUser {
  id: string;
  email: string;
  mode: "production" | "demo";
}

export interface Session {
  user: SessionUser;
  store: UserStore;
}

/** Resolve the signed-in user from a verified JWT (Supabase) or signed demo cookie. */
export async function getSession(): Promise<Session | null> {
  // Sessions are per-request: never prerender pages that depend on them.
  await connection();
  if (appMode() === "production") {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    if (error || !sub) return null;
    const user: SessionUser = { id: sub, email: String(data.claims.email ?? ""), mode: "production" };
    return { user, store: new SupabaseUserStore(sub, supabase, supabaseAdmin()) };
  }
  const jar = await cookies();
  const demo = verifyDemoSession(jar.get(DEMO_COOKIE)?.value);
  if (!demo) return null;
  return { user: { id: demo.userId, email: demo.email, mode: "demo" }, store: new DemoUserStore(demo.userId) };
}

/** For pages: redirect to sign-in when signed out. */
export async function requireSession(next?: string): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  // Signed in but the migrations haven't run: explain instead of crashing.
  if (s.user.mode === "production" && !(await databaseReady(supabaseAdmin()))) redirect("/setup");
  return s;
}
