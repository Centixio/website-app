import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CREDIT_COSTS, CREDIT_PACK, CREDIT_POLICY, PLANS } from "@/config/pricing";

export const metadata: Metadata = { title: "Pricing" };

const COSTS: [string, number, string][] = [
  ["First website generation", CREDIT_COSTS.initialGeneration, "Plans, assembles, validates and saves your site."],
  ["Complex 3D surcharge", CREDIT_COSTS.complex3dSurcharge, "Uploaded models, exploded views, scroll-driven cameras with pinning, or high-quality rendering."],
  ["Targeted chat edit", CREDIT_COSTS.smallEdit, "“Make the scroll more dramatic”, “add a pricing section”."],
  ["Major redesign", CREDIT_COSTS.majorRedesign, "Re-plans most of the site: new direction, new brief, translation."],
  ["Applying visual/3D/motion settings", CREDIT_COSTS.reassemble, "Re-assembles the existing design without an AI call."],
  ["Restoring a version", CREDIT_COSTS.restore, "Creates a new current version from any earlier one."],
  ["Downloading HTML or ZIP", CREDIT_COSTS.export, "Always free."],
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-5xl sm:text-6xl">Pricing</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">Subscriptions include monthly credits. Buy extra credits whenever you need them. There is no unlimited plan: every AI generation uses credits, and the cost is always shown before you confirm.</p>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {Object.values(PLANS).map((plan, i) => (
          <section key={plan.id} aria-labelledby={`plan-${plan.id}`} className={`flex flex-col rounded-2xl border p-7 ${i === 1 ? "border-primary/60 bg-primary/5" : "border-border/60 bg-card/40"}`}>
            <h2 id={`plan-${plan.id}`} className="text-xl font-medium">{plan.name}</h2>
            <p className="mt-4"><span className="font-display text-5xl">${plan.priceUsdMonthly}</span> <span className="text-muted-foreground">/ month</span></p>
            <p className="mt-1 text-sm text-primary">{plan.monthlyCredits} credits each billing cycle</p>
            <ul className="mt-6 flex-1 space-y-2.5 text-sm">
              {plan.highlights.map((h) => (
                <li key={h} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />{h}</li>
              ))}
            </ul>
            <Button asChild size="lg" className="mt-8" variant={i === 1 ? "default" : "outline"}>
              <Link href={`/billing?plan=${plan.id}`}>Choose {plan.name}</Link>
            </Button>
          </section>
        ))}
        <section aria-labelledby="pack" className="flex flex-col rounded-2xl border border-border/60 bg-card/40 p-7">
          <h2 id="pack" className="text-xl font-medium">{CREDIT_PACK.name}</h2>
          <p className="mt-4"><span className="font-display text-5xl">${CREDIT_PACK.priceUsd}</span> <span className="text-muted-foreground">one-time</span></p>
          <p className="mt-1 text-sm text-primary">{CREDIT_PACK.credits} credits that never expire</p>
          <p className="mt-6 flex-1 text-sm text-muted-foreground">Top up with or without a subscription. Purchased credits are used after your subscription credits.</p>
          <Button asChild size="lg" variant="outline" className="mt-8">
            <Link href="/billing?pack=1">Buy credits</Link>
          </Button>
        </section>
      </div>

      <div className="mt-20 grid gap-12 lg:grid-cols-2">
        <section aria-labelledby="costs">
          <h2 id="costs" className="font-display text-3xl">What actions cost</h2>
          <table className="mt-6 w-full text-sm">
            <caption className="sr-only">Credit cost per action</caption>
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-border/60"><th className="py-2 font-normal">Action</th><th className="py-2 text-right font-normal">Credits</th></tr>
            </thead>
            <tbody>
              {COSTS.map(([label, cost, note]) => (
                <tr key={label} className="border-b border-border/40 align-top">
                  <td className="py-3"><div>{label}</div><div className="text-xs text-muted-foreground">{note}</div></td>
                  <td className="py-3 text-right font-mono">{cost === 0 ? "Free" : cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section aria-labelledby="policy">
          <h2 id="policy" className="font-display text-3xl">Credit policy</h2>
          <dl className="mt-6 space-y-5">
            {CREDIT_POLICY.map((p) => (
              <div key={p.title}>
                <dt className="font-medium">{p.title}</dt>
                <dd className="mt-1 text-sm text-muted-foreground">{p.body}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
