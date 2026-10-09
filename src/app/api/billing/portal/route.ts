import { HttpError, json, withSession } from "@/lib/api/http";
import { env, isStripeConfigured } from "@/lib/env";
import { ensureCustomer, stripe } from "@/lib/billing/stripe";

export const POST = withSession(async ({ session }) => {
  if (session.user.mode !== "production" || !isStripeConfigured()) throw new HttpError(503, "billing_unavailable", "Billing is not configured on this server.");
  const customer = await ensureCustomer(session.user.id, session.user.email);
  const portal = await stripe().billingPortal.sessions.create({ customer, return_url: `${env.appUrl().replace(/\/$/, "")}/billing` });
  return json({ url: portal.url });
});
