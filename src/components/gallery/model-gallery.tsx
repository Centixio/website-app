"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ModelThumbnail } from "@/components/three/model-thumbnail";
import { MODELS, type CatalogModel } from "@/lib/catalog/models";
import { getDirection } from "@/lib/catalog/directions";

const ModelStage = dynamic(() => import("@/components/three/model-stage").then((m) => m.ModelStage), { ssr: false, loading: () => <div className="size-full animate-pulse bg-muted/30" /> });

const PALETTE = getDirection("cinematic-dark").palette;

export function ModelGallery() {
  const [open, setOpen] = useState<CatalogModel | null>(null);
  const [explode, setExplode] = useState(0);
  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MODELS.map((m) => (
          <li key={m.id}>
            <button onClick={() => { setExplode(0); setOpen(m); }} className="group w-full overflow-hidden rounded-2xl border border-border/60 bg-card/40 text-left transition-colors hover:border-primary/50">
              <div className="aspect-[4/3] bg-[radial-gradient(circle_at_50%_40%,oklch(0.25_0.01_75),transparent_70%)]">
                <ModelThumbnail modelId={m.id} palette={PALETTE} lighting="studio" className="size-full" />
              </div>
              <div className="space-y-1.5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{m.name}</span>
                  <Badge variant="outline" className="capitalize">{m.category}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{m.description}</p>
                <p className="text-xs text-muted-foreground">{m.separable ? `${m.parts.length} separable parts · exploded view` : "Single surface · no exploded view"}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{open.name}</DialogTitle>
                <DialogDescription>{open.description} Drag to rotate — this is the same interactive WebGL model generated sites use.</DialogDescription>
              </DialogHeader>
              <div className="aspect-[16/10] overflow-hidden rounded-xl bg-[#07070a]">
                <ModelStage className="size-full" modelId={open.id} palette={PALETTE} lighting="moody-rim" explode={explode} autoRotate={explode === 0} />
              </div>
              {open.separable ? (
                <div className="space-y-2">
                  <Label htmlFor="explode">Exploded view</Label>
                  <Slider id="explode" min={0} max={1} step={0.01} value={[explode]} onValueChange={([v]) => setExplode(v)} aria-label="Exploded view amount" />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">This model is a single surface, so an exploded view isn&apos;t offered.</p>
              )}
              <p className="text-xs text-muted-foreground">License: {open.license}. {open.provenance}</p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
