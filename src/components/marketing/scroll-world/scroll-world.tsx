"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Film } from "lucide-react";
import { mountScrollWorld } from "./engine";
import { cn } from "@/lib/utils";

export interface WorldStop {
  id: string;
  label: string;
  eyebrow: string;
  title: string;
  body: string;
  tags?: string[];
  cta?: { primary: { label: string; href: string }; secondary?: { label: string; href: string } };
  scroll?: number;
  linger?: number;
}

const BASE = "/films/world";
const CONNECTORS = ["conn-describe-direct", "conn-direct-generate", "conn-generate-refine", "conn-refine-ship"];

/**
 * Scroll-scrubbed, pre-rendered camera flight through the Centixio world.
 * Scroll drives time only; the film is rendered offline (films/src/world.js),
 * which is why it can afford soft shadows, AO and depth of field on any phone.
 */
export function ScrollWorld({ stops }: { stops: WorldStop[] }) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const copyRefs = useRef<(HTMLElement | null)[]>([]);
  const bar = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!section.current || !stage.current) return;
    const destroy = mountScrollWorld(
      section.current,
      stage.current,
      {
        sections: stops.map((s) => ({
          id: s.id,
          label: s.label,
          still: `${BASE}/dive-${s.id}.webp`,
          stillMobile: `${BASE}/dive-${s.id}-m.webp`,
          clip: `${BASE}/dive-${s.id}.mp4`,
          clipMobile: `${BASE}/dive-${s.id}-m.mp4`,
          scroll: s.scroll,
          linger: s.linger,
        })),
        connectors: CONNECTORS.map((c) => `${BASE}/${c}.mp4`),
        connectorsMobile: CONNECTORS.map((c) => `${BASE}/${c}-m.mp4`),
        diveScroll: 1.4,
        connScroll: 0.9,
      },
      {
        onCopy(i, opacity, pr) {
          const el = copyRefs.current[i];
          if (!el) return;
          el.style.opacity = String(opacity);
          el.style.transform = `translateY(${((0.5 - pr) * 4).toFixed(2)}vh)`;
          el.style.pointerEvents = opacity > 0.5 ? "auto" : "none";
          el.setAttribute("aria-hidden", opacity < 0.5 ? "true" : "false");
        },
        onActive: setActive,
        onProgress(p) {
          if (bar.current) bar.current.style.transform = `scaleX(${p})`;
        },
      },
    );
    return destroy;
  }, [stops]);

  const jump = (i: number) => (section.current as (HTMLElement & { __swJump?: (i: number) => void }) | null)?.__swJump?.(i);

  return (
    <section ref={section} aria-label="How Centixio works — a scroll-controlled film" className="sw-section relative">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <div ref={stage} className="sw-stage absolute inset-0" aria-hidden />
        <div className="sw-scrim pointer-events-none absolute inset-0" aria-hidden />
        <div className="absolute inset-x-0 top-0 z-30 h-[2px] bg-primary/15" aria-hidden>
          <span ref={bar} className="block h-full origin-left scale-x-0 bg-primary" />
        </div>
        <span className="absolute right-4 top-4 z-30 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] text-white/80 backdrop-blur sm:right-6 sm:top-6">
          <Film className="size-3.5" aria-hidden /> Pre-rendered film · scroll to scrub
        </span>
        <div className="absolute inset-0 z-20">
          {stops.map((s, i) => (
            <article
              key={s.id}
              ref={(el) => {
                copyRefs.current[i] = el;
              }}
              className="sw-copy absolute opacity-0 will-change-[opacity,transform]"
              style={{ opacity: i === 0 ? 1 : 0 }}
            >
              <span className="font-mono text-xs tracking-[0.14em] text-white/55">
                {String(i + 1).padStart(2, "0")} / {String(stops.length).padStart(2, "0")}
              </span>
              <span className="mt-4 block text-xs font-medium uppercase tracking-[0.18em] text-primary">{s.eyebrow}</span>
              <h2 className="font-display mt-3 text-balance text-[clamp(2.4rem,5vw,4.6rem)] leading-[0.98] text-white">{s.title}</h2>
              <p className="mt-4 max-w-[40ch] text-[clamp(1rem,1.25vw,1.15rem)] leading-relaxed text-white/75">{s.body}</p>
              {s.tags && (
                <ul className="mt-5 flex flex-wrap gap-2">
                  {s.tags.map((t) => (
                    <li key={t} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 backdrop-blur">{t}</li>
                  ))}
                </ul>
              )}
              {s.cta && (
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link href={s.cta.primary.href} className="rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5">{s.cta.primary.label}</Link>
                  {s.cta.secondary && <Link href={s.cta.secondary.href} className="rounded-full border border-white/25 px-5 py-3 text-sm text-white transition-transform hover:-translate-y-0.5">{s.cta.secondary.label}</Link>}
                </div>
              )}
            </article>
          ))}
        </div>
        <nav aria-label="Film chapters" className="sw-route absolute right-3 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-5 sm:right-6">
          {stops.map((s, i) => (
            <button key={s.id} type="button" onClick={() => jump(i)} aria-current={active === i ? "step" : undefined} className="group relative grid size-7 place-items-center rounded-full">
              <span className={cn("block size-2 rounded-full transition-all duration-300", active === i ? "scale-150 bg-primary shadow-[0_0_0_5px_oklch(0.82_0.13_78/0.22)]" : "bg-white/35 group-hover:bg-white/70")} />
              <span className={cn("absolute right-8 hidden whitespace-nowrap rounded-full bg-black/60 px-2.5 py-1 text-xs text-white backdrop-blur transition-opacity sm:block", active === i ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>{s.label}</span>
            </button>
          ))}
        </nav>
      </div>
      <noscript>
        <ol className="mx-auto max-w-3xl space-y-6 px-6 py-16">
          {stops.map((s) => (
            <li key={s.id}><h2 className="font-display text-3xl">{s.title}</h2><p className="text-muted-foreground">{s.body}</p></li>
          ))}
        </ol>
      </noscript>
    </section>
  );
}
