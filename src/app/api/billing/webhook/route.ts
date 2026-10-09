import type Stripe from "stripe";
import { env, isStripeConfigured } from "@/lib/env";
import { stripe } from "@/lib/billing/stripe";
import { actionForEvent } from "@/lib/billing/webhook";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Stripe webhook. Verifies the signature against the raw body, then applies
 * the event exactly once via process_billing_event (deduplicated by event id
 * inside the same transaction that grants credits). Returns 500 on transient
 * failure so Stripe retries.
 */
export async function POST(req: Request) {
  if (!isStripeConfigured()) return new Response("Billing not configured", { status: 503 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, env.stripeWebhookSecret()!);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  try {
    const action = await actionForEvent(event);
    const { data, error } = await supabaseAdmin().rpc("process_billing_event", {
      p_event_id: event.id,
      p_type: event.type,
      p_created: new Date(event.created * 1000).toISOString(),
      p_action: action,
    });
    if (error) throw new Error(error.message);
    return Response.json({ received: true, applied: data, action: action.kind });
  } catch (err) {
    console.error("[stripe webhook]", event.type, event.id, err);
    return new Response("Webhook processing failed", { status: 500 });
  }
}
