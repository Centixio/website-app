import "server-only";
import type Stripe from "stripe";
import { CREDIT_PACK, PLANS } from "@/config/pricing";
import { packPriceId, planForPrice, stripe, userIdForCustomer } from "./stripe";

/**
 * Translate a *verified* Stripe event into one idempotent ledger action for
 * public.process_billing_event. Credits are granted only for events that
 * prove payment (paid checkout sessions, paid invoices). Current state is
 * re-read from the Stripe API so out-of-order delivery cannot apply stale data.
 */
export type BillingAction =
  | { kind: "noop"; reason: string }
  | { kind: "customer"; user_id: string; customer_id: string }
  | { kind: "purchase"; user_id: string; credits: number; ref: string }
  | { kind: "revoke_purchase"; user_id: string; credits: number; ref: string }
  | {
      kind: "subscription";
      user_id: string;
      subscription_id: string;
      plan: string;
      status: string;
      price_id: string | null;
      period_start: string;
      period_key: string;
      period_end: string;
      cancel_at_period_end: boolean;
      allocate_credits: number;
    };

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));
const iso = (s: number) => new Date(s * 1000).toISOString();

async function subscriptionAction(sub: Stripe.Subscription, allocate: boolean): Promise<BillingAction> {
  const userId = sub.metadata?.user_id || (await userIdForCustomer(idOf(sub.customer)));
  if (!userId) return { kind: "noop", reason: "subscription without a known user" };
  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  const plan = planForPrice(priceId);
  if (!plan || !item) return { kind: "noop", reason: `unknown price ${priceId}` };
  const paidStatus = sub.status === "active" || sub.status === "trialing";
  return {
    kind: "subscription",
    user_id: userId,
    subscription_id: sub.id,
    plan,
    status: sub.status,
    price_id: priceId,
    period_start: iso(item.current_period_start),
    // Allocation key: once per period per plan, so an upgrade mid-period grants the new plan's credits once.
    period_key: `${iso(item.current_period_start)}:${plan}`,
    period_end: iso(item.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end,
    allocate_credits: allocate && paidStatus ? PLANS[plan].monthlyCredits : 0,
  };
}

async function packCredits(session: Stripe.Checkout.Session): Promise<number> {
  const items = await stripe().checkout.sessions.listLineItems(session.id, { limit: 10 });
  const qty = items.data.filter((li) => li.price?.id === packPriceId()).reduce((n, li) => n + (li.quantity ?? 0), 0);
  return qty * CREDIT_PACK.credits;
}

export async function actionForEvent(event: Stripe.Event): Promise<BillingAction> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      const userId = s.metadata?.user_id || s.client_reference_id || (await userIdForCustomer(idOf(s.customer)));
      if (!userId) return { kind: "noop", reason: "checkout without user" };
      if (s.mode === "payment") {
        if (s.payment_status !== "paid") return { kind: "noop", reason: "payment not yet confirmed" };
        const credits = await packCredits(s);
        if (!credits) return { kind: "noop", reason: "no credit pack line items" };
        return { kind: "purchase", user_id: userId, credits, ref: s.id };
      }
      const customer = idOf(s.customer);
      return customer ? { kind: "customer", user_id: userId, customer_id: customer } : { kind: "noop", reason: "no customer" };
    }
    case "invoice.paid": {
      const invoice = event.data.object;
      const subId = idOf(invoice.parent?.subscription_details?.subscription ?? null);
      if (!subId) return { kind: "noop", reason: "invoice not for a subscription" };
      const sub = await stripe().subscriptions.retrieve(subId);
      return subscriptionAction(sub, true);
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      // State only; credits are granted by invoice.paid.
      const sub = event.type === "customer.subscription.deleted" ? event.data.object : await stripe().subscriptions.retrieve(event.data.object.id);
      return subscriptionAction(sub, false);
    }
    case "charge.refunded": {
      const charge = event.data.object;
      const piId = idOf(charge.payment_intent);
      if (!piId) return { kind: "noop", reason: "charge without payment intent" };
      const sessions = await stripe().checkout.sessions.list({ payment_intent: piId, limit: 1 });
      const s = sessions.data[0];
      if (!s || s.mode !== "payment") return { kind: "noop", reason: "refund not for a credit pack" };
      const userId = s.metadata?.user_id || (await userIdForCustomer(idOf(charge.customer)));
      if (!userId) return { kind: "noop", reason: "refund without user" };
      const total = await packCredits(s);
      const credits = Math.round((total * charge.amount_refunded) / Math.max(1, charge.amount));
      return credits > 0 ? { kind: "revoke_purchase", user_id: userId, credits, ref: `${charge.id}:${charge.amount_refunded}` } : { kind: "noop", reason: "nothing to revoke" };
    }
    default:
      return { kind: "noop", reason: `unhandled ${event.type}` };
  }
}
