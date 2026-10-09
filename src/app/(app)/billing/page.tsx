import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { isStripeConfigured } from "@/lib/env";
import { CREDIT_COSTS, CREDIT_PACK, CREDIT_POLICY, PLANS } from "@/config/pricing";
import { CheckoutButton, DemoTopUpButton, PortalButton } from "@/components/app/billing-actions";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Billing & credits" };

const TYPE_LABEL: Record<string, string> = {
  allocation: "Subscription credits",
  purchase: "Credit pack",
  reservation: "Reserved",
  deduction: "Charged",
  release: "Released",
  expiration: "Expired",
  refund: "Refund",
  revocation: "Revoked (refund)",
  adjustment: "Adjustment",
};

export default async function BillingPage(props: PageProps<"/billing">) {
  const sp = await props.searchParams;
  const session = await requireSession("/billing");
  const { store, user } = session;
  const [credits, ledger, sub] = await Promise.all([store.credits(), store.ledger(40), store.subscription()]);
  const billingReady = user.mode === "production" && isStripeConfigured();
  const checkout = typeof sp.checkout === "string" ? sp.checkout : null;

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6">
      <header>
        <h1 className="font-display text-4xl">Billing & credits</h1>
        {checkout === "success" && (
          <p role="status" className="mt-4 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
            Thanks! Credits are added as soon as Stripe confirms the payment — usually within a few seconds. Refresh this page if they don&apos;t appear yet.
          </p>
        )}
        {checkout === "canceled" && <p role="status" className="mt-4 text-sm text-muted-foreground">Checkout was canceled. You were not charged.</p>}
        {!billingReady && (
          <p className="mt-4 rounded-lg border border-border bg-card/50 p-3 text-sm text-muted-foreground">
            {user.mode === "demo"
              ? "Demo mode: real billing is disabled. Use demo top-ups to try chargeable actions."
              : "Billing isn't configured on this server yet (missing Stripe keys or price IDs). Purchases are disabled; no payments can be taken."}
          </p>
        )}
      </header>

      <section aria-labelledby="balance" className="grid gap-4 sm:grid-cols-4">
        <h2 id="balance" className="sr-only">Balance</h2>
        {[
          ["Available", credits.total, user.mode === "demo" ? "demo credits" : "credits"],
          ["Subscription", credits.subscription, credits.subscriptionExpiresAt ? `expire ${new Date(credits.subscriptionExpiresAt).toLocaleDateString()}` : "reset each cycle"],
          ["Purchased / other", credits.purchased, "never expire"],
          ["Reserved", credits.held, "for running generations"],
        ].map(([label, value, note]) => (
          <div key={label as string} className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 font-display text-4xl tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{note}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="plans" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="plans" className="text-xl font-medium">Plan</h2>
          {sub && billingReady && <PortalButton />}
        </div>
        {sub ? (
          <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5">
            <p className="text-lg">{PLANS[sub.plan].name} <Badge variant="outline" className="ml-2 capitalize">{sub.status.replace("_", " ")}</Badge></p>
            <p className="mt-1 text-sm text-muted-foreground">
              {PLANS[sub.plan].monthlyCredits} credits per cycle.{sub.currentPeriodEnd ? ` Current period ends ${new Date(sub.currentPeriodEnd).toLocaleDateString()}.` : ""}
              {sub.cancelAtPeriodEnd ? " Cancels at period end." : ""}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {Object.values(PLANS).map((p) => (
              <div key={p.id} className={`flex flex-col gap-3 rounded-2xl border p-5 ${sp.plan === p.id ? "border-primary" : "border-border/60"} bg-card/40`}>
                <p className="text-lg">{p.name}</p>
                <p><span className="font-display text-4xl">${p.priceUsdMonthly}</span><span className="text-muted-foreground"> / month · {p.monthlyCredits} credits</span></p>
                <CheckoutButton kind="plan" plan={p.id} label={`Subscribe to ${p.name}`} disabled={!billingReady} />
              </div>
            ))}
            <div className={`flex flex-col gap-3 rounded-2xl border p-5 ${sp.pack ? "border-primary" : "border-border/60"} bg-card/40`}>
              <p className="text-lg">{CREDIT_PACK.name}</p>
              <p><span className="font-display text-4xl">${CREDIT_PACK.priceUsd}</span><span className="text-muted-foreground"> · {CREDIT_PACK.credits} credits</span></p>
              {user.mode === "demo" ? <DemoTopUpButton /> : <CheckoutButton kind="pack" label="Buy credits" variant="outline" disabled={!billingReady} />}
            </div>
          </div>
        )}
        {sub && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 p-5">
            <p className="flex-1 text-sm text-muted-foreground">Need more this cycle? A credit pack adds {CREDIT_PACK.credits} credits for ${CREDIT_PACK.priceUsd}; they never expire.</p>
            <CheckoutButton kind="pack" label="Buy credit pack" variant="outline" disabled={!billingReady} />
          </div>
        )}
      </section>

      <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="history">
          <h2 id="history" className="text-xl font-medium">Credit history</h2>
          {ledger.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No credit activity yet.</p>
          ) : (
            <table className="mt-4 w-full text-sm">
              <caption className="sr-only">Recent credit ledger entries</caption>
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border/60"><th className="py-2 font-normal">When</th><th className="py-2 font-normal">Entry</th><th className="py-2 text-right font-normal">Available</th><th className="py-2 text-right font-normal">Reserved</th></tr>
              </thead>
              <tbody>
                {ledger.map((e) => (
                  <tr key={e.id} className="border-b border-border/40">
                    <td className="py-2.5 text-muted-foreground">{new Date(e.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="py-2.5"><span>{TYPE_LABEL[e.type] ?? e.type}</span>{e.description && e.description !== TYPE_LABEL[e.type] && <span className="block text-xs text-muted-foreground">{e.description}</span>}</td>
                    <td className={`py-2.5 text-right font-mono ${e.deltaAvailable > 0 ? "text-emerald-400" : e.deltaAvailable < 0 ? "text-foreground" : "text-muted-foreground"}`}>{e.deltaAvailable > 0 ? `+${e.deltaAvailable}` : e.deltaAvailable || "—"}</td>
                    <td className="py-2.5 text-right font-mono text-muted-foreground">{e.deltaHeld > 0 ? `+${e.deltaHeld}` : e.deltaHeld || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section aria-labelledby="policy" className="space-y-6">
          <h2 id="policy" className="text-xl font-medium">How credits work</h2>
          <dl className="space-y-4 text-sm">
            {CREDIT_POLICY.map((p) => (
              <div key={p.title}><dt className="font-medium">{p.title}</dt><dd className="mt-1 text-muted-foreground">{p.body}</dd></div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">Costs: generation {CREDIT_COSTS.initialGeneration} (+{CREDIT_COSTS.complex3dSurcharge} complex 3D) · edit {CREDIT_COSTS.smallEdit} · redesign {CREDIT_COSTS.majorRedesign} · settings, restore, repair and downloads free.</p>
        </section>
      </div>
    </div>
  );
}
