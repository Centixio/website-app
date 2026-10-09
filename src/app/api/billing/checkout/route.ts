import { z } from "zod";
import { body, HttpError, json, withSession } from "@/lib/api/http";
import { env, isStripeConfigured } from "@/lib/env";
import { PLANS } from "@/config/pricing";
import { ensureCustomer, packPriceId, stripe } from "@/lib/billing/stripe";

const Schema = z.discriminatedUnion("kind", [z.object({ kind: z.literal("plan"), plan: z.enum(["starter", "pro"]) }), z.object({ kind: z.literal("pack") })]);

/** Creates a real Stripe Checkout session. Credits are granted only by the verified webhook after payment. */
export const POST = withSession(async ({ req, session }) => {
  if (session.user.mode !== "production" || !isStripeConfigured()) throw new HttpError(503, "billing_unavailable", "Billing is not configured on this server.");
  const input = await body(req, Schema);
  const customer = await ensureCustomer(session.user.id, session.user.email);
  const base = env.appUrl().replace(/\/$/, "");
  if (input.kind === "plan") {
    const existing = await session.store.subscription();
    if (existing) throw new HttpError(409, "already_subscribed", "You already have a subscription. Use Manage billing to change plans.");
    const price = env.stripePrice(PLANS[input.plan].stripePriceEnv)!;
    const s = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: session.user.id,
      line_items: [{ price, quantity: 1 }],
      metadata: { user_id: session.user.id, plan: input.plan },
      subscription_data: { metadata: { user_id: session.user.id, plan: input.plan } },
      success_url: `${base}/billing?checkout=success`,
      cancel_url: `${base}/billing?checkout=canceled`,
      allow_promotion_codes: true,
    });
    return json({ url: s.url });
  }
  const s = await stripe().checkout.sessions.create({
    mode: "payment",
    customer,
    client_reference_id: session.user.id,
    line_items: [{ price: packPriceId(), quantity: 1 }],
    metadata: { user_id: session.user.id, kind: "credit_pack" },
    payment_intent_data: { metadata: { user_id: session.user.id, kind: "credit_pack" } },
    success_url: `${base}/billing?checkout=success`,
    cancel_url: `${base}/billing?checkout=canceled`,
  });
  return json({ url: s.url });
});
