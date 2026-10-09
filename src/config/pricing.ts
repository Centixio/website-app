/**
 * Centralized pricing and credit costs.
 *
 * These numbers are initial placeholders, not validated unit economics.
 * Change them here; the UI, cost estimator, checkout, and webhook handlers
 * all read from this module. Stripe price IDs come from the environment so
 * test and live mode can use different prices.
 */

export type PlanId = "starter" | "pro";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  priceUsdMonthly: number;
  monthlyCredits: number;
  /** Env var holding the Stripe recurring Price ID. */
  stripePriceEnv: "STRIPE_PRICE_STARTER" | "STRIPE_PRICE_PRO";
  highlights: string[];
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceUsdMonthly: 20,
    monthlyCredits: 100,
    stripePriceEnv: "STRIPE_PRICE_STARTER",
    highlights: [
      "100 credits every billing cycle",
      "All visual directions and curated 3D models",
      "Single-file HTML and ZIP export",
      "Version history and restore",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceUsdMonthly: 49,
    monthlyCredits: 300,
    stripePriceEnv: "STRIPE_PRICE_PRO",
    highlights: [
      "300 credits every billing cycle",
      "Everything in Starter",
      "Upload your own GLB / glTF models",
      "Higher concurrent generation limit",
    ],
  },
};

export const CREDIT_PACK = {
  id: "pack_50",
  name: "Credit pack",
  priceUsd: 10,
  credits: 50,
  stripePriceEnv: "STRIPE_PRICE_CREDIT_PACK" as const,
};

/** Credit cost of each chargeable action. */
export const CREDIT_COSTS = {
  /** First generation of a website for a project. */
  initialGeneration: 10,
  /** Surcharge added when the generation includes complex 3D (see estimator). */
  complex3dSurcharge: 6,
  /** Targeted chat edits ("make the scroll more dramatic"). */
  smallEdit: 2,
  /** Broad changes that re-plan most of the site. */
  majorRedesign: 8,
  /** Optional AI-generated media per image (disabled unless a media provider is configured). */
  generatedMediaPerImage: 4,
  /** Applying settings that only re-assemble the existing design (no AI call). */
  reassemble: 0,
  /** Restoring a previous version. */
  restore: 0,
  /** Automatic repair after a runtime error we caused. */
  repair: 0,
  /** Downloading a completed export. */
  export: 0,
} as const;

/** Credits granted once to new accounts in demo mode only (never in production billing). */
export const DEMO_STARTING_CREDITS = 60;

export const CREDIT_POLICY: { title: string; body: string }[] = [
  {
    title: "Subscription credits reset each cycle",
    body: "Credits included with Starter or Pro are granted when a billing period starts and expire when it ends. They do not roll over.",
  },
  {
    title: "Purchased credits never expire",
    body: "Credits from one-time packs stay in your balance until you use them.",
  },
  {
    title: "Subscription credits are spent first",
    body: "When you start a chargeable action we reserve credits from the subscription balance first, then from purchased credits.",
  },
  {
    title: "Failures are not charged",
    body: "Credits are reserved before a generation starts. If it fails or is canceled, the reservation is released in full.",
  },
  {
    title: "Downloads are free",
    body: "Exporting a completed version as HTML or ZIP never costs credits.",
  },
  {
    title: "No unlimited generation",
    body: "Every AI generation consumes credits. The cost is shown before you confirm.",
  },
];
