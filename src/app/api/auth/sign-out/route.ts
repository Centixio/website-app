import { cookies } from "next/headers";
import { appMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEMO_COOKIE } from "@/lib/auth/demo-session";

export async function POST(req: Request) {
  if (appMode() === "production") {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } else {
    (await cookies()).delete(DEMO_COOKIE);
  }
  return Response.redirect(new URL("/", req.url), 303);
}
