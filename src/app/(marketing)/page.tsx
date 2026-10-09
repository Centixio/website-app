import Link from "next/link";
import { ArrowRight, Boxes, History, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HeroStage } from "@/components/marketing/hero-stage";
import { ScrollWorld, type WorldStop } from "@/components/marketing/scroll-world/scroll-world";
import { DepthGallery, type DepthItem } from "@/components/marketing/depth-gallery";
import { DirectionSwatch } from "@/components/shared/direction-card";
import { EXAMPLES } from "@/examples";
import { VISUAL_DIRECTIONS } from "@/lib/catalog/directions";
import { CREDIT_COSTS, PLANS } from "@/config/pricing";
import { brand } from "@/config/brand";

// Story beats (scroll-experience): Hook → Journey → Climax → Control → Resolution.
const STOPS: WorldStop[] = [
  { id: "describe", label: "Describe", eyebrow: "Describe", title: "Start with a sentence.", body: "Tell Centixio what you're making, who it's for and how it should feel. No design or code knowledge needed.", tags: ["Plain English", "Optional settings"], scroll: 1.6, linger: 0.35 },
  { id: "direct", label: "Direct", eyebrow: "Direct", title: "Get a direction — with reasons.", body: "Palette, typography, a 3D subject and a motion style are recommended for your brief. Keep them, or change anything.", tags: ["Auto — recommended", "Visual previews"], linger: 0.3 },
  { id: "generate", label: "Generate", eyebrow: "Generate", title: "Built from tested parts.", body: "Your site is planned, assembled from a library of cinematic sections and real-time 3D scenes, and validated before you see it.", tags: ["Cost shown first", "Validated output"], linger: 0.3 },
  { id: "refine", label: "Refine", eyebrow: "Refine", title: "Direct it in conversation.", body: "“Make the scroll more dramatic.” “Black and gold.” Every change is a new version you can preview and restore.", tags: ["Version history", "Live preview"], linger: 0.3 },
  {
    id: "ship",
    label: "Ship",
    eyebrow: "Ship",
    title: "Download a real website.",
    body: "Export a ZIP or a single HTML file with the 3D runtime included. Host it anywhere — no lock-in.",
    tags: ["ZIP or HTML", "Runs offline"],
    scroll: 1.7,
    linger: 0.4,
    cta: { primary: { label: "Start a project", href: "/sign-up" }, secondary: { label: "See sample sites", href: "#samples" } },
  },
];

const SAMPLES: DepthItem[] = EXAMPLES.map((e) => ({
  slug: e.slug,
  name: e.name,
  direction: e.directionLabel,
  poster: `/samples/posters/${e.slug}.webp`,
  href: `/examples/${e.slug}/site`,
  palette: { background: e.spec.palette.background, accent: e.spec.palette.accent, accent2: e.spec.palette.accent2 },
}));

export default function LandingPage() {
  return (
    <>
      {/* Hook */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
          <div>
            <Badge variant="outline" className="mb-6 rounded-full border-primary/40 px-3 py-1 text-primary">Websites with real 3D and cinematic scrolling</Badge>
            <h1 className="font-display text-balance text-5xl leading-[0.95] sm:text-6xl lg:text-7xl">
              Describe it. Direct it. <em className="text-primary">Ship it in 3D.</em>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              {brand.name} turns a short brief into an immersive website — interactive 3D, scroll-driven camera moves and considered motion — then lets you refine it in chat and download the source.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-11 px-5 text-base">
                <Link href="/sign-up">
                  Start a project <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-5 text-base">
                <Link href="#samples">See sample sites</Link>
              </Button>
            </div>
            <p className="mt-5 text-sm text-muted-foreground">No code needed. You see the credit cost before anything is generated.</p>
          </div>
          <HeroStage />
        </div>
        <p className="pb-6 text-center text-xs uppercase tracking-[0.2em] text-muted-foreground" aria-hidden>
          Scroll to fly through how it works
        </p>
      </section>

      {/* Journey: pre-rendered film, scrubbed by scroll */}
      <ScrollWorld stops={STOPS} />

      {/* Climax: the sample sites in depth */}
      <DepthGallery items={SAMPLES} />

      {/* Control */}
      <section aria-labelledby="control" className="border-y border-border/60 bg-card/30">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 id="control" className="font-display text-4xl sm:text-5xl">Recommendations first, control when you want it</h2>
            <p className="mt-4 text-muted-foreground">Every setting has an “Auto — recommended” option. When you want to direct, choose a visual direction, a 3D subject, materials, lighting, camera, motion intensity and mobile behavior. Incompatible combinations are prevented, not hidden.</p>
            <ul className="mt-8 space-y-4 text-sm">
              {[
                [SlidersHorizontal, "Real-time 3D you can drag and scroll — clearly separate from pre-rendered films and flat imagery, with static fallbacks when WebGL isn't available."],
                [Boxes, "Upload your own GLB model. Exploded views are only offered when the model actually has separable parts."],
                [History, "Every generation is an immutable version you can preview, restore and download."],
              ].map(([Icon, text]) => {
                const I = Icon as typeof Boxes;
                return (
                  <li key={text as string} className="flex gap-3">
                    <I className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span className="text-muted-foreground">{text as string}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {VISUAL_DIRECTIONS.filter((d) => d.id !== "custom").map((d) => (
              <figure key={d.id} className="space-y-2">
                <DirectionSwatch direction={d} />
                <figcaption className="text-xs text-muted-foreground">{d.name}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Resolution */}
      <section aria-labelledby="pricing-teaser" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="grid gap-10 rounded-3xl border border-border/60 bg-card/40 p-8 sm:p-12 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <h2 id="pricing-teaser" className="font-display text-4xl">Pay with credits. See every cost first.</h2>
            <p className="mt-4 text-muted-foreground">
              A first generation costs {CREDIT_COSTS.initialGeneration} credits ({CREDIT_COSTS.initialGeneration + CREDIT_COSTS.complex3dSurcharge} with complex 3D), a targeted edit {CREDIT_COSTS.smallEdit}, a redesign {CREDIT_COSTS.majorRedesign}. Failed generations are not charged, and downloads are always free.
            </p>
            <Button asChild size="lg" className="mt-8 h-11 px-5 text-base">
              <Link href="/sign-up">Start a project <ArrowRight /></Link>
            </Button>
          </div>
          <div className="flex flex-col justify-center gap-3">
            {Object.values(PLANS).map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
                <span>{p.name}</span>
                <span className="text-muted-foreground">${p.priceUsdMonthly}/mo · {p.monthlyCredits} credits</span>
              </div>
            ))}
            <Button asChild variant="outline" size="lg">
              <Link href="/pricing">See pricing details</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
