import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { startTestDb, type TestDb } from "./harness";

let db: TestDb | null = null;
let pool: Pool;

beforeAll(async () => {
  db = await startTestDb();
  if (db) pool = db.pool;
});
afterAll(async () => {
  await db?.stop();
});

const run = (name: string, fn: () => Promise<void>) => it(name, async () => {
  if (!db) {
    console.warn("Postgres binaries not found; skipping", name);
    return;
  }
  await fn();
});

async function newUser(): Promise<string> {
  const r = await pool.query("insert into auth.users (email) values ('u' || gen_random_uuid() || '@test.dev') returning id");
  return r.rows[0].id;
}
async function newProject(user: string): Promise<string> {
  const r = await pool.query("insert into public.projects (user_id, name) values ($1, 'Test') returning id", [user]);
  await pool.query("insert into public.project_configs (project_id, user_id, config) values ($1, $2, '{}')", [r.rows[0].id, user]);
  await pool.query("insert into public.conversations (project_id, user_id) values ($1, $2)", [r.rows[0].id, user]);
  return r.rows[0].id;
}
async function grant(user: string, source: string, amount: number, key: string, expires: string | null = null) {
  await pool.query("select public.grant_credits($1, $2, $3, $4, $5, 'test')", [user, source, amount, expires, key]);
}
async function summary(user: string) {
  return (await pool.query("select public.credit_summary($1) as s", [user])).rows[0].s as { subscription: number; purchased: number; total: number; held: number };
}
async function enqueue(user: string, project: string, cost: number, key: string, maxConcurrent = 50) {
  return pool.query("select * from public.enqueue_job($1, $2, 'generate', '{}'::jsonb, $3, $4, $5, 1000, 1800, 3)", [user, project, cost, key, maxConcurrent]);
}
async function invariants(user: string) {
  const r = await pool.query(
    `select
      (select coalesce(sum(delta_available),0) from public.credit_ledger where user_id=$1)::int as ledger_avail,
      (select coalesce(sum(remaining),0) from public.credit_grants where user_id=$1)::int as grants_remaining,
      (select coalesce(sum(delta_held),0) from public.credit_ledger where user_id=$1)::int as ledger_held,
      (select coalesce(sum(amount),0) from public.credit_reservations where user_id=$1 and status='active')::int as active_held`,
    [user],
  );
  const row = r.rows[0];
  expect(row.ledger_avail).toBe(row.grants_remaining);
  expect(row.ledger_held).toBe(row.active_held);
}

describe("credit ledger", () => {
  let user: string;
  let project: string;
  beforeEach(async () => {
    if (!db) return;
    user = await newUser();
    project = await newProject(user);
  });

  run("spends subscription credits before purchased credits", async () => {
    await grant(user, "purchase", 50, `p-${user}`);
    await grant(user, "subscription", 10, `s-${user}`, new Date(Date.now() + 86400e3).toISOString());
    await enqueue(user, project, 15, "k1");
    const s = await summary(user);
    expect(s.subscription).toBe(0);
    expect(s.purchased).toBe(45);
    expect(s.held).toBe(15);
    await invariants(user);
  });

  run("rejects reservations beyond the balance and creates no job", async () => {
    await grant(user, "purchase", 5, `p-${user}`);
    await expect(enqueue(user, project, 10, "k1")).rejects.toThrow(/insufficient_credits/);
    const jobs = await pool.query("select count(*)::int n from public.generation_jobs where user_id=$1", [user]);
    expect(jobs.rows[0].n).toBe(0);
    await invariants(user);
  });

  run("concurrent reservations cannot overspend", async () => {
    await grant(user, "purchase", 50, `p-${user}`);
    const attempts = Array.from({ length: 12 }, (_, i) => enqueue(user, project, 10, `c${i}`).then(() => "ok", (e) => String(e.message)));
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r === "ok")).toHaveLength(5);
    expect(results.filter((r) => r.includes("insufficient_credits"))).toHaveLength(7);
    const s = await summary(user);
    expect(s.total).toBe(0);
    expect(s.held).toBe(50);
    await invariants(user);
  });

  run("idempotency keys prevent double charges on retry", async () => {
    await grant(user, "purchase", 50, `p-${user}`);
    const [a, b] = await Promise.all([enqueue(user, project, 10, "same"), enqueue(user, project, 10, "same")]);
    expect(a.rows[0].id).toBe(b.rows[0].id);
    expect((await summary(user)).total).toBe(40);
    await invariants(user);
  });

  run("settles on completion and releases on final failure", async () => {
    await grant(user, "purchase", 30, `p-${user}`);
    const j1 = (await enqueue(user, project, 10, "ok")).rows[0];
    const j2 = (await enqueue(user, project, 10, "bad")).rows[0];
    const claimed1 = (await pool.query("select * from public.claim_job('w1', 60, $1)", [j1.id])).rows[0];
    expect(claimed1.status).toBe("running");
    const version = { kind: "generate", prompt: "p", config: {}, spec: {}, html: "<html></html>", credit_charge: 10, provider: "rules" };
    const vid = (await pool.query("select public.complete_job($1, 'w1', $2, 'Done', false) as v", [j1.id, version])).rows[0].v;
    expect(vid).toBeTruthy();
    // retryable failure re-queues; final failure releases
    await pool.query("select * from public.claim_job('w2', 60, $1)", [j2.id]);
    expect((await pool.query("select public.fail_job($1, 'w2', 'transient', true) as s", [j2.id])).rows[0].s).toBe("queued");
    await pool.query("select * from public.claim_job('w2', 60, $1)", [j2.id]);
    expect((await pool.query("select public.fail_job($1, 'w2', 'broken', false) as s", [j2.id])).rows[0].s).toBe("failed");
    const s = await summary(user);
    expect(s.total).toBe(20);
    expect(s.held).toBe(0);
    const types = (await pool.query("select entry_type from public.credit_ledger where user_id=$1 order by id", [user])).rows.map((r) => r.entry_type);
    expect(types).toEqual(["purchase", "reservation", "reservation", "deduction", "release"]);
    const msgs = await pool.query("select count(*)::int n from public.messages where project_id=$1 and role='assistant'", [project]);
    expect(msgs.rows[0].n).toBe(1);
    await invariants(user);
  });

  run("a worker that lost its lease cannot complete the job", async () => {
    await grant(user, "purchase", 10, `p-${user}`);
    const j = (await enqueue(user, project, 10, "lease")).rows[0];
    await pool.query("select * from public.claim_job('w1', 60, $1)", [j.id]);
    await expect(pool.query("select public.complete_job($1, 'other', '{}'::jsonb, '', false)", [j.id])).rejects.toThrow(/job_not_owned/);
  });

  run("canceling a queued job releases credits", async () => {
    await grant(user, "purchase", 10, `p-${user}`);
    const j = (await enqueue(user, project, 10, "cancel")).rows[0];
    expect((await pool.query("select public.cancel_job($1, $2) as s", [user, j.id])).rows[0].s).toBe("canceled");
    expect((await summary(user)).total).toBe(10);
    await invariants(user);
  });

  run("enforces per-user concurrency", async () => {
    await grant(user, "purchase", 100, `p-${user}`);
    await enqueue(user, project, 1, "a", 2);
    await enqueue(user, project, 1, "b", 2);
    await expect(enqueue(user, project, 1, "c", 2)).rejects.toThrow(/concurrency_limit/);
  });

  run("cannot enqueue against another user's project", async () => {
    const other = await newUser();
    await grant(other, "purchase", 10, `p-${other}`);
    await expect(enqueue(other, project, 1, "x")).rejects.toThrow(/project_not_found/);
  });

  run("sweep expires subscription credits and fails timed-out jobs", async () => {
    await grant(user, "subscription", 20, `s-${user}`, new Date(Date.now() - 1000).toISOString());
    await grant(user, "purchase", 10, `p-${user}`);
    const j = (await enqueue(user, project, 5, "old")).rows[0];
    await pool.query("update public.generation_jobs set created_at = now() - interval '2 hours' where id=$1", [j.id]);
    const r = (await pool.query("select public.sweep_jobs(900) as r")).rows[0].r;
    expect(r.jobs_failed).toBe(1);
    expect(r.grants_expired).toBe(1);
    const s = await summary(user);
    expect(s.total).toBe(10);
    expect(s.held).toBe(0);
    await invariants(user);
  });
});

describe("billing events", () => {
  run("processes each Stripe event exactly once", async () => {
    const user = await newUser();
    const action = { kind: "purchase", user_id: user, credits: 50, ref: "cs_test_1" };
    const first = await pool.query("select public.process_billing_event('evt_1', 'checkout.session.completed', now(), $1) as ok", [action]);
    const dup = await pool.query("select public.process_billing_event('evt_1', 'checkout.session.completed', now(), $1) as ok", [action]);
    // A different event for the same checkout session must not grant again either.
    await pool.query("select public.process_billing_event('evt_2', 'checkout.session.async_payment_succeeded', now(), $1)", [action]);
    expect(first.rows[0].ok).toBe(true);
    expect(dup.rows[0].ok).toBe(false);
    expect((await summary(user)).purchased).toBe(50);
    await invariants(user);
  });

  run("allocates subscription credits once per period and replaces the previous period", async () => {
    const user = await newUser();
    const base = { kind: "subscription", user_id: user, subscription_id: "sub_1", plan: "starter", status: "active", price_id: "price_s", cancel_at_period_end: false, allocate_credits: 100 };
    const p1 = { ...base, period_start: "2026-01-01T00:00:00Z", period_end: "2099-02-01T00:00:00Z" };
    await pool.query("select public.process_billing_event('evt_a', 'invoice.paid', now(), $1)", [p1]);
    await pool.query("select public.process_billing_event('evt_b', 'customer.subscription.updated', now(), $1)", [p1]);
    expect((await summary(user)).subscription).toBe(100);
    const p2 = { ...base, period_start: "2026-02-01T00:00:00Z", period_end: "2099-03-01T00:00:00Z" };
    await pool.query("select public.process_billing_event('evt_c', 'invoice.paid', now(), $1)", [p2]);
    expect((await summary(user)).subscription).toBe(100);
    const exp = await pool.query("select count(*)::int n from public.credit_ledger where user_id=$1 and entry_type='expiration'", [user]);
    expect(exp.rows[0].n).toBe(1);
    await invariants(user);
  });

  run("ignores out-of-order subscription state", async () => {
    const user = await newUser();
    const base = { kind: "subscription", user_id: user, subscription_id: "sub_2", plan: "pro", price_id: "p", period_start: "2026-01-01T00:00:00Z", period_end: "2099-01-01T00:00:00Z", allocate_credits: 0 };
    await pool.query("select public.process_billing_event('e_new', 't', '2026-05-02T00:00:00Z', $1)", [{ ...base, status: "canceled" }]);
    await pool.query("select public.process_billing_event('e_old', 't', '2026-05-01T00:00:00Z', $1)", [{ ...base, status: "active" }]);
    const r = await pool.query("select status from public.subscriptions where id='sub_2'");
    expect(r.rows[0].status).toBe("canceled");
  });
});

describe("authorization (RLS)", () => {
  run("users only see their own projects and cannot write versions or balances", async () => {
    const a = await newUser();
    const b = await newUser();
    const pa = await newProject(a);
    await newProject(b);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [b]);
      const seen = await client.query("select id from public.projects");
      expect(seen.rows.map((r) => r.id)).not.toContain(pa);
      const direct = await client.query("select id from public.projects where id = $1", [pa]);
      expect(direct.rowCount).toBe(0);
      await expect(client.query("insert into public.credit_grants (user_id, source, amount, remaining, idempotency_key) values ($1, 'purchase', 999, 999, 'hack')", [b])).rejects.toThrow();
      await client.query("rollback");
      await client.query("begin");
      await client.query("set local role authenticated");
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [b]);
      await expect(client.query("select public.grant_credits($1, 'purchase', 999, null, 'hack2', 'x')", [b])).rejects.toThrow(/permission denied/);
      await client.query("rollback");
    } finally {
      await client.query("rollback").catch(() => {});
      client.release();
    }
  });

  run("versions are immutable", async () => {
    const u = await newUser();
    const p = await newProject(u);
    const v = { kind: "restore", prompt: "", config: {}, spec: {}, html: "<html></html>", credit_charge: 0 };
    const id = (await pool.query("select public.create_free_version($1, $2, $3, '', false) as v", [u, p, v])).rows[0].v;
    await expect(pool.query("update public.project_versions set html='x' where id=$1", [id])).rejects.toThrow(/immutable/);
    await pool.query("update public.project_versions set runtime_status='ok' where id=$1", [id]);
  });
});
