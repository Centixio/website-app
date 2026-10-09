import type { Metadata } from "next";
import { ModelGallery } from "@/components/gallery/model-gallery";
import { DirectionSwatch } from "@/components/shared/direction-card";
import { VISUAL_DIRECTIONS } from "@/lib/catalog/directions";
import { SECTION_TYPES } from "@/lib/config-schema";
import { LIGHTING_PRESETS, MATERIAL_PRESETS } from "@/lib/catalog/models";

export const metadata: Metadata = { title: "Models & presets" };

export default function GalleryPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-20 px-4 py-16 sm:px-6">
      <header>
        <h1 className="font-display text-5xl sm:text-6xl">Models & presets</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">Everything a generated site can use: curated 3D subjects, visual directions and the section library. All models are original procedural assets released under CC0, so your exported sites can include them freely.</p>
      </header>

      <section aria-labelledby="models">
        <h2 id="models" className="font-display text-3xl">3D subjects</h2>
        <p className="mt-2 text-sm text-muted-foreground">Real-time WebGL models — not images. Open one to rotate it and, where the model has separable parts, try the exploded view.</p>
        <div className="mt-6"><ModelGallery /></div>
      </section>

      <section aria-labelledby="directions">
        <h2 id="directions" className="font-display text-3xl">Visual directions</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {VISUAL_DIRECTIONS.map((d) => (
            <li key={d.id} className="space-y-3 rounded-2xl border border-border/60 bg-card/40 p-3">
              <DirectionSwatch direction={d} />
              <div className="px-1 pb-1">
                <h3 className="font-medium">{d.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{d.summary}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="library" className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 id="library" className="font-display text-3xl">Section library</h2>
          <p className="mt-2 text-sm text-muted-foreground">Sites are assembled from these tested building blocks instead of being written from scratch, which keeps them fast, accessible and consistent.</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {SECTION_TYPES.map((s) => (
              <li key={s.id} className="rounded-xl border border-border/60 p-4">
                <div className="flex items-center justify-between gap-2"><span className="font-medium">{s.name}</span>{"requires3d" in s && s.requires3d && <span className="text-[11px] text-primary">3D</span>}</div>
                <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-8">
          <div>
            <h3 className="font-medium">Materials</h3>
            <p className="mt-2 text-sm text-muted-foreground">{MATERIAL_PRESETS.filter((m) => m.id !== "auto").map((m) => m.name).join(" · ")}</p>
          </div>
          <div>
            <h3 className="font-medium">Lighting</h3>
            <p className="mt-2 text-sm text-muted-foreground">{LIGHTING_PRESETS.filter((m) => m.id !== "auto").map((m) => m.name).join(" · ")}</p>
          </div>
          <div>
            <h3 className="font-medium">Your own models</h3>
            <p className="mt-2 text-sm text-muted-foreground">Upload a .glb (or self-contained .gltf) up to 25 MB on any project. We check the file, count its parts, and only offer an exploded view when it has separable parts.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
