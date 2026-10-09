import { describe, expect, it } from "vitest";
import * as L from "@/lib/credits/memory-ledger";

function invariants(s: L.LedgerState, user: string) {
  const avail = s.ledger.filter((r) => r.userId === user).reduce((n, r) => n + r.deltaAvailable, 0);
  const held = s.ledger.filter((r) => r.userId === user).reduce((n, r) => n + r.deltaHeld, 0);
  expect(avail).toBe(s.grants.filter((g) => g.userId === user).reduce((n, g) => n + g.remaining, 0));
  expect(held).toBe(s.reservations.filter((r) => r.userId === user && r.status === "active").reduce((n, r) => n + r.amount, 0));
}

describe("in-memory credit ledger (demo mode)", () => {
  it("spends subscription credits before purchased credits, soonest expiry first", () => {
    const s = L.emptyLedger();
    L.grantCredits(s, "u", "purchase", 50, null, "p", "pack");
    L.grantCredits(s, "u", "subscription", 10, Date.now() + 86400e3, "s", "sub");
    const r = L.reserve(s, "u", 15, "k", "job", 60);
    expect(r.allocations.map((a) => s.grants.find((g) => g.id === a.grantId)!.source)).toEqual(["subscription", "purchase"]);
    expect(L.summary(s, "u")).toMatchObject({ subscription: 0, purchased: 45, held: 15 });
    invariants(s, "u");
  });

  it("serialized concurrent reservations never overspend", async () => {
    const s = L.emptyLedger();
    const mutex = new L.Mutex();
    L.grantCredits(s, "u", "purchase", 50, null, "p", "pack");
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        mutex.run(async () => {
          await new Promise((r) => setTimeout(r, Math.random() * 5));
          return L.reserve(s, "u", 10, `k${i}`, null, 60);
        }).then(() => "ok", (e: L.LedgerError) => e.code),
      ),
    );
    expect(results.filter((r) => r === "ok")).toHaveLength(5);
    expect(results.filter((r) => r === "insufficient_credits")).toHaveLength(7);
    expect(L.summary(s, "u").total).toBe(0);
    invariants(s, "u");
  });

  it("is idempotent per key, settles once, and releases on failure", () => {
    const s = L.emptyLedger();
    L.grantCredits(s, "u", "purchase", 30, null, "p", "pack");
    const a = L.reserve(s, "u", 10, "same", null, 60);
    const b = L.reserve(s, "u", 10, "same", null, 60);
    expect(a.id).toBe(b.id);
    L.settle(s, a.id);
    L.settle(s, a.id);
    const c = L.reserve(s, "u", 10, "other", null, 60);
    expect(L.release(s, c.id, "failed")).toBe(10);
    expect(L.release(s, c.id, "failed again")).toBe(0);
    expect(L.summary(s, "u")).toMatchObject({ total: 20, held: 0 });
    expect(() => L.settle(s, c.id)).toThrow("reservation_not_active");
    invariants(s, "u");
  });

  it("does not roll over subscription credits and does not restore released credits into expired grants", () => {
    const s = L.emptyLedger();
    const t0 = Date.now();
    L.allocateSubscription(s, "u", 100, t0 + 1000, "sub:1", t0);
    const r = L.reserve(s, "u", 30, "k", null, 60, t0);
    L.allocateSubscription(s, "u", 100, t0 + 86400e3, "sub:2", t0 + 10);
    L.allocateSubscription(s, "u", 100, t0 + 86400e3, "sub:2", t0 + 20); // duplicate delivery
    expect(L.summary(s, "u", t0 + 30).subscription).toBe(100);
    expect(L.release(s, r.id, "failed", t0 + 40)).toBe(0); // old period's grant is expired
    expect(L.summary(s, "u", t0 + 50).total).toBe(100);
    invariants(s, "u");
  });

  it("sweeps expired grants with ledger entries", () => {
    const s = L.emptyLedger();
    L.grantCredits(s, "u", "subscription", 40, Date.now() - 1, "s", "sub");
    expect(L.sweepExpired(s)).toBe(1);
    expect(s.ledger.at(-1)?.type).toBe("expiration");
    invariants(s, "u");
  });
});
