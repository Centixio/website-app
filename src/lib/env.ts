/**
 * Environment access and integration detection.
 *
 * Integrations are "configured" only when every variable they need is present.
 * When an integration is missing the app falls back to clearly labeled demo
 * behavior (see `appMode()`); it never pretends a real payment or AI call happened.
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export const env = {
  appUrl: () => read("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",
  supabaseUrl: () => read("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () =>
    read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? read("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceKey: () => read("SUPABASE_SECRET_KEY") ?? read("SUPABASE_SERVICE_ROLE_KEY"),
  stripeSecretKey: () => read("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: () => read("STRIPE_WEBHOOK_SECRET"),
  stripePrice: (name: "STRIPE_PRICE_STARTER" | "STRIPE_PRICE_PRO" | "STRIPE_PRICE_CREDIT_PACK") =>
    read(name),
  aiProvider: () => (read("AI_PROVIDER") ?? "anthropic").toLowerCase(),
  anthropicApiKey: () => read("ANTHROPIC_API_KEY"),
  anthropicModel: () => read("ANTHROPIC_MODEL") ?? "claude-opus-5-5",
  anthropicEffort: () =>
    (read("ANTHROPIC_EFFORT") ?? "medium") as "low" | "medium" | "high" | "xhigh" | "max",
  cronSecret: () => read("CRON_SECRET"),
  demoSecret: () => read("DEMO_SESSION_SECRET"),
  /** Explicit opt-in so demo mode can never activate silently in production. */
  demoModeAllowed: () =>
    read("CENTIXIO_DEMO_MODE") === "1" ||
    (process.env.NODE_ENV !== "production" && read("CENTIXIO_DEMO_MODE") !== "0"),
  /** "inline" runs jobs right after enqueue (plus cron sweeps); "worker" leaves them to `npm run worker`. */
  jobRunner: () => (read("JOB_RUNNER") ?? "inline") as "inline" | "worker",
};

export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl() && env.supabaseAnonKey() && env.supabaseServiceKey());
}

export function isStripeConfigured(): boolean {
  return Boolean(
    env.stripeSecretKey() &&
      env.stripeWebhookSecret() &&
      env.stripePrice("STRIPE_PRICE_STARTER") &&
      env.stripePrice("STRIPE_PRICE_PRO") &&
      env.stripePrice("STRIPE_PRICE_CREDIT_PACK"),
  );
}

export function isAIConfigured(): boolean {
  if (env.aiProvider() === "anthropic") return Boolean(env.anthropicApiKey());
  return false;
}

export type AppMode = "production" | "demo";

/**
 * Production mode requires Supabase. Without it, and only when demo mode is
 * allowed, the app runs a local file-backed demo with its own demo credits.
 */
export function appMode(): AppMode {
  if (isSupabaseConfigured()) return "production";
  if (env.demoModeAllowed()) return "demo";
  throw new Error(
    "Supabase is not configured and demo mode is disabled. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY, or CENTIXIO_DEMO_MODE=1 for a local demo.",
  );
}

export interface IntegrationStatus {
  mode: AppMode;
  supabase: boolean;
  stripe: boolean;
  ai: boolean;
  aiProvider: string;
}

export function integrationStatus(): IntegrationStatus {
  return {
    mode: appMode(),
    supabase: isSupabaseConfigured(),
    stripe: isStripeConfigured(),
    ai: isAIConfigured(),
    aiProvider: isAIConfigured() ? env.aiProvider() : "demo-rules",
  };
}
