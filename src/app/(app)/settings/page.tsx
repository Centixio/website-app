import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { integrationStatus } from "@/lib/env";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Account settings" };

export default async function SettingsPage() {
  const { user } = await requireSession("/settings");
  const status = integrationStatus();
  const rows: [string, boolean, string][] = [
    ["Accounts & database (Supabase)", status.supabase, status.supabase ? "Connected" : "Not configured — running in local demo mode"],
    ["Payments (Stripe)", status.stripe, status.stripe ? "Connected" : "Not configured — purchases disabled"],
    ["AI generation", status.ai, status.ai ? `Using ${status.aiProvider}` : "Not configured — rule-based composer (demo) or generation disabled"],
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl">Account settings</h1>
      <section aria-labelledby="account" className="space-y-3 rounded-2xl border border-border/60 bg-card/40 p-6">
        <h2 id="account" className="text-lg font-medium">Account</h2>
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">Email</dt><dd>{user.email}</dd>
          <dt className="text-muted-foreground">Account type</dt><dd>{user.mode === "demo" ? "Local demo account" : "Standard"}</dd>
        </dl>
        <p className="text-xs text-muted-foreground">
          {user.mode === "production" ? "For a password reset or to delete your account and its data, contact support." : "Demo accounts are stored only in this server's .demo-data folder."}
        </p>
        <form action="/api/auth/sign-out" method="post"><Button variant="outline" type="submit">Sign out</Button></form>
      </section>
      <section aria-labelledby="integrations" className="space-y-3 rounded-2xl border border-border/60 bg-card/40 p-6">
        <h2 id="integrations" className="text-lg font-medium">Service status</h2>
        <ul className="divide-y divide-border/60 text-sm">
          {rows.map(([label, ok, note]) => (
            <li key={label} className="flex items-start justify-between gap-4 py-3">
              <span>{label}</span>
              <span className={ok ? "text-emerald-400" : "text-muted-foreground"}>{note}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
