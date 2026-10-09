import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ForgotPasswordForm } from "@/components/auth/password-forms";
import { appMode, env } from "@/lib/env";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage() {
  await connection();
  const production = appMode() === "production";
  return (
    <div>
      <h1 className="font-display text-4xl">Reset your password</h1>
      <p className="mb-8 mt-2 text-sm text-muted-foreground">We&apos;ll email you a link to choose a new one.</p>
      {production ? (
        <ForgotPasswordForm supabase={{ url: env.supabaseUrl()!, key: env.supabaseAnonKey()! }} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Password reset isn&apos;t available in local demo mode. <Link className="underline" href="/sign-up">Create a new demo account</Link> instead.
        </p>
      )}
    </div>
  );
}
