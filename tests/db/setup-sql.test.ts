import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { startTestDb, type TestDb } from "./harness";

const root = path.resolve(__dirname, "../..");
let db: TestDb | null = null;
beforeAll(async () => {
  db = await startTestDb({ setupFile: true });
});
afterAll(async () => {
  await db?.stop();
});

it("supabase/setup.sql contains every migration verbatim", () => {
  const setup = fs.readFileSync(path.join(root, "supabase/setup.sql"), "utf8");
  for (const f of fs.readdirSync(path.join(root, "supabase/migrations")).filter((x) => x.endsWith(".sql"))) {
    expect(setup, `${f} is out of sync — regenerate setup.sql`).toContain(fs.readFileSync(path.join(root, "supabase/migrations", f), "utf8"));
  }
});

it("supabase/setup.sql applies cleanly to a fresh database and backfills profiles", async () => {
  if (!db) return;
  const { rows } = await db.pool.query("select count(*)::int n from information_schema.tables where table_schema = 'public'");
  expect(rows[0].n).toBeGreaterThanOrEqual(15);
  const fn = await db.pool.query("select public.credit_summary('00000000-0000-4000-8000-000000000000') s");
  expect(fn.rows[0].s.total).toBe(0);
});
