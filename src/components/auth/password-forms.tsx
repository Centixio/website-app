"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Supa = { url: string; key: string };

/** Sends a Supabase password-reset email. The link returns via /auth/callback to /reset-password. */
export function ForgotPasswordForm({ supabase }: { supabase: Supa }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const client = createSupabaseBrowserClient(supabase.url, supabase.key);
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` });
    setBusy(false);
    // Same message whether or not the address exists, so accounts can't be enumerated.
    if (error && !/rate|limit/i.test(error.message)) setError("Something went wrong. Please try again.");
    else if (error) setError(error.message);
    else setSent(true);
  }

  if (sent) {
    return (
      <p role="status" className="rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm">
        If an account exists for <strong>{email}</strong>, a reset link is on its way. It expires after a short time.
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={busy || !email}>
        {busy && <Loader2 className="animate-spin" />} Send reset link
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link className="underline underline-offset-4" href="/sign-in">Back to sign in</Link>
      </p>
    </form>
  );
}

/** Sets a new password for the session established by the reset link. */
export function ResetPasswordForm({ supabase }: { supabase: Supa }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    setError(null);
    const client = createSupabaseBrowserClient(supabase.url, supabase.key);
    const { error } = await client.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input id="password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" aria-describedby="pw-hint" />
        <p id="pw-hint" className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input id="confirm" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-11" />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={busy || password.length < 8}>
        {busy && <Loader2 className="animate-spin" />} Update password
      </Button>
    </form>
  );
}
