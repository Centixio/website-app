import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthForm } from "@/components/auth/auth-form";
import { appMode, env } from "@/lib/env";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign up" };

function safeNext(n: string | string[] | undefined) {
  const v = Array.isArray(n) ? n[0] : n;
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/dashboard";
}

export default async function Page(props: PageProps<"/sign-up">) {
  const sp = await props.searchParams;
  await connection();
  const next = safeNext(sp.next);
  if (await getSession()) redirect(next);
  const mode = appMode();
  const err = sp.error === "link" || sp.error === "confirm" ? "That link is invalid or has expired. Please try again." : null;
  return (
    <div>
      <h1 className="font-display text-4xl">Create your account</h1>
      <p className="mb-8 mt-2 text-sm text-muted-foreground">Start building your first 3D website.</p>
      <AuthForm mode="sign-up" appMode={mode} supabase={mode === "production" ? { url: env.supabaseUrl()!, key: env.supabaseAnonKey()! } : null} next={next} initialError={err} />
    </div>
  );
}
