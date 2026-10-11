import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { CheckCircle2, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { appMode, env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";
import { databaseReady } from "@/lib/data/supabase-store";

export const metadata: Metadata = { title: "Database setup", robots: { index: false } };

/** Shown when a signed-in user hits the app before the Supabase migrations have been applied. */
export default async function SetupPage() {
  await connection();
  const production = appMode() === "production";
  const ready = production ? await databaseReady(supabaseAdmin()) : true;
  const ref = env.supabaseUrl()?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];

  if (ready) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
        <CheckCircle2 className="mx-auto size-10 text-primary" aria-hidden />
        <h1 className="font-display mt-6 text-5xl">You&apos;re all set.</h1>
        <p className="mt-3 text-muted-foreground">The database is ready.</p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/dashboard">Open your projects</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <Database className="size-9 text-primary" aria-hidden />
      <h1 className="font-display mt-6 text-5xl">Database setup required</h1>
      <p className="mt-4 text-muted-foreground">
        You&apos;re signed in, but this Supabase project doesn&apos;t have Centixio&apos;s tables yet. This is a one-time step for the site owner.
      </p>
      <ol className="mt-8 list-decimal space-y-4 pl-5 text-sm leading-relaxed">
        <li>
          Open the{" "}
          {ref ? (
            <a className="text-primary underline underline-offset-4" href={`https://supabase.com/dashboard/project/${ref}/sql/new`} target="_blank" rel="noopener">
              SQL Editor for your project
            </a>
          ) : (
            "SQL Editor in your Supabase dashboard"
          )}
          .
        </li>
        <li>
          Paste the contents of <code className="rounded bg-muted px-1.5 py-0.5">supabase/setup.sql</code> from the repository and click <strong>Run</strong>. It creates the tables, security rules, functions and the private storage bucket.
        </li>
        <li>Reload this page. When it says you&apos;re all set, open your projects.</li>
      </ol>
      <p className="mt-8 text-sm text-muted-foreground">
        Prefer the CLI? Run <code className="rounded bg-muted px-1.5 py-0.5">supabase link --project-ref {ref ?? "<ref>"}</code> then{" "}
        <code className="rounded bg-muted px-1.5 py-0.5">supabase db push</code>.
      </p>
      <Button asChild variant="outline" size="lg" className="mt-8">
        <Link href="/setup">Check again</Link>
      </Button>
    </div>
  );
}
