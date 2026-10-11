import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Pool } from "pg";

/**
 * Starts a throwaway local Postgres cluster (needs `initdb`/`postgres` on PATH),
 * applies Supabase stubs + all migrations, and returns a pool.
 * Returns null when Postgres binaries are unavailable so DB tests can skip.
 */
export interface TestDb {
  pool: Pool;
  stop(): Promise<void>;
}

function has(bin: string): boolean {
  try {
    execFileSync("which", [bin], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export async function startTestDb(opts: { setupFile?: boolean } = {}): Promise<TestDb | null> {
  if (process.env.TEST_DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 12 });
    await applyMigrations(pool, opts.setupFile);
    return { pool, stop: () => pool.end() };
  }
  if (!has("initdb") || !has("postgres")) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "centixio-pg-"));
  execFileSync("initdb", ["-D", dir, "-U", "postgres", "--auth=trust", "-E", "UTF8"], { stdio: "ignore" });
  const port = 54000 + Math.floor(Math.random() * 1000);
  const proc: ChildProcess = spawn("postgres", ["-D", dir, "-p", String(port), "-k", dir, "-c", "listen_addresses="], { stdio: "ignore" });
  const pool = new Pool({ host: dir, port, user: "postgres", database: "postgres", max: 12 });
  for (let i = 0; i < 100; i++) {
    try {
      await pool.query("select 1");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  await applyMigrations(pool, opts.setupFile);
  return {
    pool,
    async stop() {
      await pool.end();
      proc.kill("SIGINT");
      await new Promise((r) => proc.once("exit", r));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function applyMigrations(pool: Pool, setupFile = false) {
  const root = path.resolve(__dirname, "../..");
  await pool.query(fs.readFileSync(path.join(__dirname, "supabase-stubs.sql"), "utf8"));
  if (setupFile) {
    await pool.query(fs.readFileSync(path.join(root, "supabase", "setup.sql"), "utf8"));
    return;
  }
  const migDir = path.join(root, "supabase", "migrations");
  for (const f of fs.readdirSync(migDir).filter((x) => x.endsWith(".sql")).sort()) {
    await pool.query(fs.readFileSync(path.join(migDir, f), "utf8"));
  }
}
