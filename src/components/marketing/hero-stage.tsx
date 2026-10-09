"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { getDirection } from "@/lib/catalog/directions";
import { cn } from "@/lib/utils";

const ModelStage = dynamic(() => import("@/components/three/model-stage").then((m) => m.ModelStage), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse rounded-3xl bg-muted/30" />,
});

const PRESETS = [
  { modelId: "perfume-bottle", direction: "luxury", lighting: "golden-hour", label: "Fragrance" },
  { modelId: "headphones", direction: "cinematic-dark", lighting: "moody-rim", label: "Audio" },
  { modelId: "crystal-cluster", direction: "futuristic", lighting: "neon-dual", label: "Gaming" },
  { modelId: "liquid-orb", direction: "clean-technology", lighting: "studio", label: "SaaS" },
] as const;

export function HeroStage() {
  const [i, setI] = useState(0);
  const preset = PRESETS[i];
  const dir = getDirection(preset.direction);
  return (
    <div className="relative">
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-border/60" style={{ background: `radial-gradient(70% 60% at 50% 40%, ${dir.palette.accent}22, transparent 70%), ${dir.palette.background}` }}>
        <ModelStage key={preset.modelId} className="absolute inset-0" modelId={preset.modelId} palette={dir.palette} lighting={preset.lighting} quality="medium" />
        <span className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/40 px-2.5 py-1 text-[11px] text-white/80 backdrop-blur">Live WebGL · drag to rotate</span>
      </div>
      <div role="radiogroup" aria-label="Example subject" className="mt-4 flex flex-wrap justify-center gap-2">
        {PRESETS.map((p, idx) => (
          <button
            key={p.modelId}
            role="radio"
            aria-checked={i === idx}
            onClick={() => setI(idx)}
            className={cn("rounded-full border px-3.5 py-1.5 text-sm transition-colors", i === idx ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
