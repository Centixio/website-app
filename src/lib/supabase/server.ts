import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/** Per-request client acting as the signed-in user (RLS applies). */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl()!, env.supabaseAnonKey()!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component; the proxy refreshes sessions instead.
        }
      },
    },
  });
}

let admin: SupabaseClient | null = null;

/** Service-role client. Server-only; bypasses RLS — only used for privileged RPCs and workers. */
export function supabaseAdmin(): SupabaseClient {
  if (!admin) {
    admin = createClient(env.supabaseUrl()!, env.supabaseServiceKey()!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
