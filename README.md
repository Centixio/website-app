# Centixio

Describe a website, accept or adjust recommended visual settings, generate an immersive 3D site, refine it in chat, and download the source.

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS v4 + shadcn/ui, Supabase (auth, Postgres, storage), Stripe (subscriptions + credit packs), Claude via the Anthropic SDK (behind a provider adapter), Three.js / React Three Fiber / Drei, GSAP + ScrollTrigger, and Zod.

The brand name is centralized in `src/config/brand.ts`, the logo mark in `src/components/brand/logo.tsx`, and static brand files in `public/brand/` and `src/app/icon.svg`, `favicon.ico`, `apple-icon.png`.

---

## Quick start (local demo, no credentials)

```bash
npm install
npm run dev          # builds the site runtime, then starts Next.js on :3000
```

Without Supabase credentials the app runs in **local demo mode** (clearly labeled in the UI):

- Accounts and projects are stored in `.demo-data/` on this machine (single server process only).
- New accounts get 60 **demo credits** with no monetary value; billing is disabled (a "demo top-up" button replaces checkout).
- Without `ANTHROPIC_API_KEY`, generation uses the **rule-based composer**: real sites with templated copy and bracketed placeholders, labeled as "no AI" on every version.

Add `ANTHROPIC_API_KEY` to `.env.local` to generate with Claude while staying in demo mode.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (runs `build:runtime` first) |
| `npm run build` / `npm start` | Production build / server |
| `npm run worker` | Long-running job worker (see Jobs) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest: ledger, concurrency, webhooks, authorization, export, uploads, pipeline. The SQL tests start a throwaway Postgres if `initdb`/`postgres` are on PATH (or use `TEST_DATABASE_URL`), otherwise they skip. |
| `npm run build:runtime` | Bundles `src/runtime/*` + three.js into `public/vendor/centixio-runtime.min.js` and copies GSAP |

## Environment variables

See `.env.example`. Summary:

| Variable | Required for | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | all | Public origin (Stripe redirects, metadata) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | production | Public, safe for the browser |
| `SUPABASE_SECRET_KEY` | production | **Server-only** service key (legacy `SUPABASE_SERVICE_ROLE_KEY` also accepted) |
| `ANTHROPIC_API_KEY` | AI generation | **Server-only**. `AI_PROVIDER=anthropic`; optional `ANTHROPIC_MODEL` (default `claude-opus-5-5`), `ANTHROPIC_EFFORT` (default `medium`) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | billing | **Server-only** |
| `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_CREDIT_PACK` | billing | Stripe Price IDs |
| `JOB_RUNNER` | jobs | `inline` (default) or `worker` |
| `CRON_SECRET` | jobs | Protects `/api/cron/jobs` |
| `ALLOW_RULES_COMPOSER` | optional | `1` allows the rule-based composer in production when no AI key is set (otherwise generation is disabled there) |
| `CENTIXIO_DEMO_MODE`, `DEMO_SESSION_SECRET` | demo only | Demo is automatic in development; in production it must be explicitly enabled and needs a secret |

## Database setup (Supabase)

1. Create a Supabase project. In **Authentication → URL configuration**, set the Site URL to `NEXT_PUBLIC_APP_URL` and add `https://<your-domain>/auth/callback` and `https://<your-domain>/auth/confirm` as redirect URLs. Email confirmation works with either the PKCE link (`/auth/callback`) or a `token_hash` template pointing at `/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
2. Apply the migrations:
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
   - `20261009000001_core.sql`: profiles, projects, configs, conversations/messages, assets, immutable versions, RLS, and the private `project-assets` storage bucket with per-user folder policies.
   - `20261009000002_billing_credits_jobs.sql`: subscriptions, processed billing events, credit grants / reservations / ledger, generation jobs, rate limits, and the `SECURITY DEFINER` functions (executable only by the service role) that reserve, settle, release, allocate and sweep atomically.
3. Copy the URL, publishable key and secret key into `.env.local`.

Clients can read their own rows through RLS but cannot write balances, versions, jobs or billing data. Those writes go only through the service-role functions, which the server calls after authenticating the user.

## Stripe setup

1. Create products and **recurring monthly prices**: Starter ($20) and Pro ($49). Create a **one-time price** for the credit pack ($10). Put the Price IDs in the env vars. Plan credits and prices are configured in `src/config/pricing.ts`.
2. Add a webhook endpoint at `https://<your-domain>/api/billing/webhook` for these events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`.
   Set `STRIPE_WEBHOOK_SECRET` to its signing secret. Locally: `stripe listen --forward-to localhost:3000/api/billing/webhook`.
3. Configure the **Customer Portal** in the Stripe dashboard (plan switching, cancellation, payment methods).

How credits are granted:

- Signatures are verified against the raw body. Each event id is recorded in `processed_billing_events` inside the same transaction that grants credits, so duplicates are no-ops.
- Credits are granted only by events that prove payment: a paid checkout session (credit pack, quantity read from Stripe line items) or `invoice.paid` (plan credits, once per subscription period and plan).
- Subscription state is re-read from the Stripe API and applied only if newer than the last applied event, so out-of-order delivery is safe.
- A new period expires the previous subscription credits (no rollover). Purchased credits never expire. Pack refunds revoke the matching remaining purchased credits.

## Jobs

Generation runs as durable jobs in `generation_jobs` with leases:

- **Inline (default):** after enqueueing, the route schedules the job with `after()` from `next/server`. Use this when your platform allows long function durations (routes set `maxDuration = 300`).
- **Cron sweeper:** `GET /api/cron/jobs` with `Authorization: Bearer $CRON_SECRET` runs queued jobs and sweeps: it times out stuck jobs, releases orphaned reservations and expires subscription credits. `vercel.json` schedules it every minute, or use Supabase `pg_cron` + `pg_net`.
- **Worker (recommended for long generations):** set `JOB_RUNNER=worker` and run `npm run worker` on a long-lived host (Fly, Railway, Render, a VM). Several workers can run safely, since claims use `FOR UPDATE SKIP LOCKED` and expired leases are reclaimed.

Limits (`src/config/limits.ts`): per-plan concurrent jobs, jobs per hour, bounded retries (3), bounded repair attempts (2), a 15-minute job timeout and a 30-minute reservation TTL. Every failure path releases reserved credits.

## Architecture

```
brief + settings ─▶ recommendations (rules; optional AI wording)
                 ─▶ cost estimate (src/lib/credits/estimate.ts) ─▶ confirm
                 ─▶ enqueue job + atomic credit reservation
worker: plan (AI provider → structured AIPlan via Zod, or rules baseline)
      ─▶ normalize to strict DesignSpec (user's explicit settings win; conflicts fixed)
      ─▶ assemble HTML from the section library + 3D runtime
      ─▶ validate (structure, links, assets, forms, contrast, fabricated claims) ─▶ bounded AI repair
      ─▶ save immutable version + settle credits (one transaction)
client: sandboxed preview ─▶ runtime bridge reports ready/errors ─▶ free "Repair" if needed
```

- **AI never writes HTML or JavaScript.** It returns a structured plan (`src/lib/spec/schema.ts`), and the deterministic assembler (`src/lib/assembler/`) renders it from tested sections. The provider adapter lives in `src/lib/ai/provider.ts`. `AnthropicProvider` uses structured outputs, prompt caching on the stable system prompt, and server-side refusal fallbacks; `RulesProvider` is the deterministic fallback.
- **Edits** send the current plan plus the instruction. Targeted edits keep everything else identical; the edited plan becomes the new settings so the panel stays in sync.
- **3D runtime** (`src/runtime/`): procedural CC0 models with named parts, material and lighting presets, camera fitting, pointer/scroll/exploded interactions, a capped DPR, rendering paused off-screen, static fallbacks without WebGL, a simplified mobile mode, and reduced-motion support. The in-app gallery uses the same builders through React Three Fiber.
- **Preview isolation:** `/preview-frame` is loaded in `<iframe sandbox="allow-scripts">` (opaque origin, so no cookies, storage or authenticated APIs) with its own strict CSP. The app posts the document in, and bridge messages are accepted only from that frame, with a per-render nonce and a Zod-validated shape. Asset URLs are short-lived signed URLs. The server never executes generated code.
- **Exports:** the ZIP contains `index.html`, `assets/`, `vendor/` (three.js runtime + GSAP), a README and license notices, and works offline except for Google Fonts. The single HTML file inlines everything (up to a 12 MB asset limit). Neither contains secrets or app URLs. Contact forms render only with a configured https endpoint; otherwise they fall back to an email link.

## Production deployment checklist

- Set all production env vars; never expose `SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY` or `CRON_SECRET` to the client (none are `NEXT_PUBLIC_`).
- Apply migrations, configure auth redirect URLs, create Stripe prices, the webhook and the portal.
- Choose a job strategy: inline + cron, or `JOB_RUNNER=worker` with `npm run worker` on a long-lived host. Always schedule `/api/cron/jobs` for sweeping.
- Make sure `public/vendor/` is built (`prebuild` does this) and shipped; export routes read it from disk (`outputFileTracingIncludes`).
- Demo mode is off in production unless `CENTIXIO_DEMO_MODE=1`. Keep it off for real deployments.

## Known limitations

- The real AI path (Anthropic) is implemented and typechecked but needs `ANTHROPIC_API_KEY` to run; the end-to-end browser run here used the rule-based composer.
- Stripe and Supabase integrations are implemented against current SDKs (Stripe API `2026-09-30`, `@supabase/ssr` 0.12) and the SQL is tested against Postgres 16, but they need real credentials to verify against live services.
- "Optional generated media" has a configured cost (`CREDIT_COSTS.generatedMediaPerImage`) but no media provider is wired up, so the feature is not offered in the UI.
- Project thumbnails are posters derived from the design spec (palette, type, 3D model), not screenshots of the page.
- Demo mode stores data in one process's memory plus `.demo-data/`. Don't run two servers against the same folder.
- Account deletion and password reset UIs are not built; use Supabase Auth's hosted flows or the dashboard.
