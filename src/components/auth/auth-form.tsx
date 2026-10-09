"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface Props {
  mode: "sign-in" | "sign-up";
  appMode: "production" | "demo";
  supabase: { url: string; key: string } | null;
  next: string;
  initialError?: string | null;
}

export function AuthForm({ mode, appMode, supabase, next, initialError }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (appMode === "demo") {
        const res = await fetch(`/api/auth/demo/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error?.message ?? "Something went wrong.");
        router.replace(next);
        router.refresh();
        return;
      }
      const client = createSupabaseBrowserClient(supabase!.url, supabase!.key);
      if (mode === "sign-in") {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
        router.replace(next);
        router.refresh();
      } else {
        const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
        if (error) throw new Error(error.message);
        if (data.session) {
          router.replace(next);
          router.refresh();
        } else {
          setNotice("Check your email to confirm your account, then sign in.");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {appMode === "demo" && (
        <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
          <strong>Local demo mode.</strong> Supabase isn&apos;t configured, so accounts are stored locally on this server, generation uses the rule-based composer unless an AI key is set, and credits are demo credits with no monetary value.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" aria-describedby="password-hint" />
        {mode === "sign-up" && <p id="password-hint" className="text-xs text-muted-foreground">At least 8 characters.</p>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
      <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={busy || !email || password.length < (mode === "sign-up" ? 8 : 1)}>
        {busy && <Loader2 className="animate-spin" />}
        {mode === "sign-in" ? "Sign in" : "Create account"}
      </Button>
      {mode === "sign-in" && appMode === "production" && (
        <p className="text-center text-sm">
          <Link className="text-muted-foreground underline underline-offset-4 hover:text-foreground" href="/forgot-password">Forgot password?</Link>
        </p>
      )}
      {mode === "sign-up" && (
        <p className="text-center text-xs text-muted-foreground">
          By creating an account you agree to the <Link className="underline underline-offset-4" href="/terms">Terms</Link> and <Link className="underline underline-offset-4" href="/privacy">Privacy Policy</Link>.
        </p>
      )}
      <p className="text-center text-sm text-muted-foreground">
        {mode === "sign-in" ? (
          <>No account yet? <Link className="text-foreground underline underline-offset-4" href={`/sign-up?next=${encodeURIComponent(next)}`}>Create one</Link></>
        ) : (
          <>Already have an account? <Link className="text-foreground underline underline-offset-4" href={`/sign-in?next=${encodeURIComponent(next)}`}>Sign in</Link></>
        )}
      </p>
    </form>
  );
}
