import "server-only";
import Stripe from "stripe";
import { env, isStripeConfigured } from "@/lib/env";
import { CREDIT_PACK, PLANS, type PlanId } from "@/config/pricing";
import { supabaseAdmin } from "@/lib/supabase/server";

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!isStripeConfigured()) throw new Error("Stripe is not configured");
  client ??= new Stripe(env.stripeSecretKey()!, { appInfo: { name: "Centixio" } });
  return client;
}

export function planForPrice(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  for (const plan of Object.values(PLANS)) if (env.stripePrice(plan.stripePriceEnv) === priceId) return plan.id;
  return null;
}

export function packPriceId(): string {
  return env.stripePrice(CREDIT_PACK.stripePriceEnv)!;
}

/** Find or create the Stripe customer for a user (idempotent per user). */
export async function ensureCustomer(userId: string, email: string): Promise<string> {
  const admin = supabaseAdmin();
  const { data } = await admin.from("billing_customers").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
  if (data?.stripe_customer_id) return data.stripe_customer_id;
  const customer = await stripe().customers.create({ email: email || undefined, metadata: { user_id: userId } }, { idempotencyKey: `customer:${userId}` });
  const { error } = await admin.from("billing_customers").upsert({ user_id: userId, stripe_customer_id: customer.id }, { onConflict: "user_id" });
  if (error) throw new Error(`Could not store billing customer: ${error.message}`);
  return customer.id;
}

export async function userIdForCustomer(customerId: string | null | undefined): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await supabaseAdmin().from("billing_customers").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
  return data?.user_id ?? null;
}
