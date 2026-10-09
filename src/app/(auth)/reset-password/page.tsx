import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/auth/password-forms";
import { appMode, env } from "@/lib/env";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  // The reset link signs the user in via /auth/callback; without that session, start over.
  const session = await getSession();
  if (!session || appMode() !== "production") redirect("/forgot-password");
  return (
    <div>
      <h1 className="font-display text-4xl">Choose a new password</h1>
      <p className="mb-8 mt-2 text-sm text-muted-foreground">Signed in as {session.user.email}.</p>
      <ResetPasswordForm supabase={{ url: env.supabaseUrl()!, key: env.supabaseAnonKey()! }} />
    </div>
  );
}
