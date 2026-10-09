/**
 * In-memory credit ledger with the same semantics as the SQL implementation
 * (supabase/migrations/*_billing_credits_jobs.sql). Used by the local demo
 * store and by unit tests. Callers must serialize access (see Mutex).
 */

export type GrantSource = "subscription" | "purchase" | "demo" | "refund" | "adjustment";

export interface Grant {
  id: string;
  userId: string;
  source: GrantSource;
  amount: number;
  remaining: number;
  expiresAt: number | null;
  key: string;
  createdAt: number;
}

export interface Reservation {
  id: string;
  userId: string;
  jobId: string | null;
  amount: number;
  status: "active" | "settled" | "released" | "refunded";
  allocations: { grantId: string; amount: number }[];
  key: string;
  expiresAt: number;
  createdAt: number;
}

export interface LedgerRow {
  id: string;
  userId: string;
  type: "allocation" | "purchase" | "reservation" | "deduction" | "release" | "expiration" | "refund" | "revocation" | "adjustment";
  deltaAvailable: number;
  deltaHeld: number;
  grantId?: string;
  reservationId?: string;
  jobId?: string | null;
  key?: string;
  description: string;
  createdAt: number;
}

export interface LedgerState {
  grants: Grant[];
  reservations: Reservation[];
  ledger: LedgerRow[];
}

export class LedgerError extends Error {
  constructor(public code: "insufficient_credits" | "invalid_amount" | "reservation_not_active" | "not_found") {
    super(code);
  }
}

let counter = 0;
const id = () => `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function emptyLedger(): LedgerState {
  return { grants: [], reservations: [], ledger: [] };
}

const live = (g: Grant, now: number) => g.remaining > 0 && (g.expiresAt === null || g.expiresAt > now);

export function available(s: LedgerState, userId: string, now = Date.now()) {
  return s.grants.filter((g) => g.userId === userId && live(g, now)).reduce((n, g) => n + g.remaining, 0);
}

export function summary(s: LedgerState, userId: string, now = Date.now()) {
  const grants = s.grants.filter((g) => g.userId === userId && live(g, now));
  const sub = grants.filter((g) => g.source === "subscription");
  const expiries = sub.map((g) => g.expiresAt).filter((x): x is number => x !== null);
  return {
    subscription: sub.reduce((n, g) => n + g.remaining, 0),
    purchased: grants.filter((g) => g.source !== "subscription").reduce((n, g) => n + g.remaining, 0),
    total: grants.reduce((n, g) => n + g.remaining, 0),
    held: s.reservations.filter((r) => r.userId === userId && r.status === "active").reduce((n, r) => n + r.amount, 0),
    subscriptionExpiresAt: expiries.length ? new Date(Math.min(...expiries)).toISOString() : null,
  };
}

export function grantCredits(s: LedgerState, userId: string, source: GrantSource, amount: number, expiresAt: number | null, key: string, description: string, now = Date.now()): Grant {
  const existing = s.grants.find((g) => g.key === key);
  if (existing) return existing;
  if (amount <= 0) throw new LedgerError("invalid_amount");
  const g: Grant = { id: id(), userId, source, amount, remaining: amount, expiresAt, key, createdAt: now };
  s.grants.push(g);
  s.ledger.push({ id: id(), userId, type: source === "purchase" ? "purchase" : source === "subscription" ? "allocation" : source === "refund" ? "refund" : "adjustment", deltaAvailable: amount, deltaHeld: 0, grantId: g.id, key: `ledger:${key}`, description, createdAt: now });
  return g;
}

export function expireGrant(s: LedgerState, grantId: string, reason: string, now = Date.now()) {
  const g = s.grants.find((x) => x.id === grantId);
  if (!g) return;
  if (g.remaining > 0) s.ledger.push({ id: id(), userId: g.userId, type: "expiration", deltaAvailable: -g.remaining, deltaHeld: 0, grantId: g.id, description: reason, createdAt: now });
  g.remaining = 0;
  g.expiresAt = Math.min(g.expiresAt ?? now, now);
}

export function reserve(s: LedgerState, userId: string, amount: number, key: string, jobId: string | null, ttlSeconds: number, now = Date.now()): Reservation {
  if (amount <= 0) throw new LedgerError("invalid_amount");
  const existing = s.reservations.find((r) => r.key === key);
  if (existing) return existing;
  if (available(s, userId, now) < amount) throw new LedgerError("insufficient_credits");
  const ordered = s.grants
    .filter((g) => g.userId === userId && live(g, now))
    .sort((a, b) => {
      const pa = a.source === "subscription" ? 0 : 1;
      const pb = b.source === "subscription" ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const ea = a.expiresAt ?? Infinity;
      const eb = b.expiresAt ?? Infinity;
      return ea !== eb ? ea - eb : a.createdAt - b.createdAt;
    });
  let need = amount;
  const allocations: Reservation["allocations"] = [];
  for (const g of ordered) {
    if (need === 0) break;
    const take = Math.min(g.remaining, need);
    g.remaining -= take;
    allocations.push({ grantId: g.id, amount: take });
    need -= take;
  }
  const r: Reservation = { id: id(), userId, jobId, amount, status: "active", allocations, key, expiresAt: now + ttlSeconds * 1000, createdAt: now };
  s.reservations.push(r);
  s.ledger.push({ id: id(), userId, type: "reservation", deltaAvailable: -amount, deltaHeld: amount, reservationId: r.id, jobId, description: "Credits reserved", createdAt: now });
  return r;
}

export function settle(s: LedgerState, reservationId: string, now = Date.now()) {
  const r = s.reservations.find((x) => x.id === reservationId);
  if (!r) throw new LedgerError("not_found");
  if (r.status === "settled") return;
  if (r.status !== "active") throw new LedgerError("reservation_not_active");
  r.status = "settled";
  s.ledger.push({ id: id(), userId: r.userId, type: "deduction", deltaAvailable: 0, deltaHeld: -r.amount, reservationId: r.id, jobId: r.jobId, description: "Credits charged", createdAt: now });
}

export function release(s: LedgerState, reservationId: string, reason: string, now = Date.now()): number {
  const r = s.reservations.find((x) => x.id === reservationId);
  if (!r || r.status !== "active") return 0;
  let returned = 0;
  for (const a of r.allocations) {
    const g = s.grants.find((x) => x.id === a.grantId);
    if (g && (g.expiresAt === null || g.expiresAt > now)) {
      g.remaining += a.amount;
      returned += a.amount;
    }
  }
  r.status = "released";
  s.ledger.push({ id: id(), userId: r.userId, type: "release", deltaAvailable: returned, deltaHeld: -r.amount, reservationId: r.id, jobId: r.jobId, description: reason, createdAt: now });
  return returned;
}

export function allocateSubscription(s: LedgerState, userId: string, amount: number, periodEnd: number, key: string, now = Date.now()) {
  if (s.grants.some((g) => g.key === key)) return;
  for (const g of s.grants.filter((x) => x.userId === userId && x.source === "subscription" && x.remaining > 0)) expireGrant(s, g.id, "Subscription period ended", now);
  grantCredits(s, userId, "subscription", amount, periodEnd, key, "Subscription credits for new billing period", now);
}

export function sweepExpired(s: LedgerState, now = Date.now()) {
  let n = 0;
  for (const g of s.grants) {
    if (g.remaining > 0 && g.expiresAt !== null && g.expiresAt <= now) {
      expireGrant(s, g.id, "Credits expired at end of billing period", now);
      n++;
    }
  }
  return n;
}

/** Simple async mutex to serialize ledger mutations within one process. */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T> | T): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => undefined);
    return next;
  }
}
