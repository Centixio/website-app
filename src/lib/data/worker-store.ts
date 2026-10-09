import "server-only";
import { appMode } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SupabaseWorkerStore } from "./supabase-store";
import { DemoWorkerStore } from "./demo-store";
import type { WorkerStore } from "./types";

/** Privileged store for job execution. Never pass this to request handlers that act for a user. */
export function getWorkerStore(): WorkerStore {
  return appMode() === "production" ? new SupabaseWorkerStore(supabaseAdmin()) : new DemoWorkerStore();
}
