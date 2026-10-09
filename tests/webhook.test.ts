import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const subscriptionsRetrieve = vi.fn();
const listLineItems = vi.fn();
vi.mock("@/lib/billing/stripe", () => ({
  stripe: () => ({ subscriptions: { retrieve: subscriptionsRetrieve }, checkout: { sessions: { listLineItems, list: vi.fn() } } }),
  planForPrice: (id: string) => (id === "price_starter" ? "starter" : id === "price_pro" ? "pro" : null),
  packPriceId: () => "price_pack",
  userIdForCustomer: async () => null,
}));

const { actionForEvent } = await import("@/lib/billing/webhook");

const event = <T extends Stripe.Event["type"]>(type: T, object: unknown) => ({ id: "evt_1", type, created: 1_800_000_000, data: { object } }) as unknown as Stripe.Event;

const sub = (status: string, price = "price_starter") => ({
  id: "sub_1",
  status,
  customer: "cus_1",
  metadata: { user_id: "user-1" },
  cancel_at_period_end: false,
  items: { data: [{ price: { id: price }, current_period_start: 1_800_000_000, current_period_end: 1_802_592_000 }] },
});

describe("Stripe webhook → ledger actions", () => {
  beforeEach(() => {
    subscriptionsRetrieve.mockReset();
    listLineItems.mockReset();
  });

  it("grants pack credits only for paid sessions, from verified line items", async () => {
    listLineItems.mockResolvedValue({ data: [{ price: { id: "price_pack" }, quantity: 2 }] });
    const paid = await actionForEvent(event("checkout.session.completed", { id: "cs_1", mode: "payment", payment_status: "paid", metadata: { user_id: "user-1" } }));
    expect(paid).toEqual({ kind: "purchase", user_id: "user-1", credits: 100, ref: "cs_1" });
    const pending = await actionForEvent(event("checkout.session.completed", { id: "cs_2", mode: "payment", payment_status: "unpaid", metadata: { user_id: "user-1" } }));
    expect(pending.kind).toBe("noop");
  });

  it("allocates plan credits on invoice.paid using fresh subscription state", async () => {
    subscriptionsRetrieve.mockResolvedValue(sub("active", "price_pro"));
    const a = await actionForEvent(event("invoice.paid", { parent: { subscription_details: { subscription: "sub_1" } } }));
    expect(a).toMatchObject({ kind: "subscription", plan: "pro", allocate_credits: 300, user_id: "user-1" });
    expect(a.kind === "subscription" && a.period_key).toMatch(/:pro$/);
  });

  it("never allocates credits from subscription lifecycle events alone", async () => {
    subscriptionsRetrieve.mockResolvedValue(sub("active"));
    const a = await actionForEvent(event("customer.subscription.updated", { id: "sub_1" }));
    expect(a).toMatchObject({ kind: "subscription", allocate_credits: 0 });
    const unpaid = await actionForEvent(event("customer.subscription.deleted", sub("canceled")));
    expect(unpaid).toMatchObject({ kind: "subscription", status: "canceled", allocate_credits: 0 });
  });

  it("ignores unknown prices and unrelated events", async () => {
    subscriptionsRetrieve.mockResolvedValue(sub("active", "price_unknown"));
    expect((await actionForEvent(event("invoice.paid", { parent: { subscription_details: { subscription: "sub_1" } } }))).kind).toBe("noop");
    expect((await actionForEvent(event("customer.created", {}))).kind).toBe("noop");
  });
});
