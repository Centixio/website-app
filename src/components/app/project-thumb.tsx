import { ModelThumbnail } from "@/components/three/model-thumbnail";
import { getFont } from "@/lib/catalog/fonts";
import type { ProjectSummary } from "@/lib/data/types";

/** Poster derived from the project's current design spec (palette, type, 3D subject). */
export function ProjectThumb({ thumb, name }: { thumb: ProjectSummary["thumb"]; name: string }) {
  if (!thumb) {
    return (
      <div className="grid aspect-[16/10] place-items-center bg-[repeating-linear-gradient(135deg,transparent,transparent_10px,oklch(1_0_0/3%)_10px,oklch(1_0_0/3%)_20px)] text-xs text-muted-foreground">
        Not generated yet
      </div>
    );
  }
  const p = thumb.palette;
  const font = getFont(thumb.display);
  return (
    <div className="relative aspect-[16/10] overflow-hidden" style={{ background: p.background, color: p.text }}>
      <div className="absolute inset-0" style={{ background: `radial-gradient(60% 70% at 75% 45%, ${p.accent}33, transparent 70%)` }} />
      {thumb.modelId && <ModelThumbnail modelId={thumb.modelId} palette={p} className="absolute right-2 top-1/2 h-[80%] w-1/2 -translate-y-1/2" alt="" />}
      <div className="absolute inset-y-0 left-0 flex w-[58%] flex-col justify-center gap-2 p-4">
        <span className="h-1 w-8 rounded-full" style={{ background: p.accent }} />
        <span className="line-clamp-3 text-lg leading-tight" style={{ fontFamily: `'${font.family}', ${font.fallback}` }}>{thumb.heading || name}</span>
      </div>
    </div>
  );
}
