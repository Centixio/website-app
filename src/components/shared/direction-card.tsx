import { getFont } from "@/lib/catalog/fonts";
import type { VisualDirection } from "@/lib/catalog/directions";
import { cn } from "@/lib/utils";

/** Visual preview of a direction: real palette, real display/body fonts, corner radius. */
export function DirectionSwatch({ direction, className, compact = false }: { direction: VisualDirection; className?: string; compact?: boolean }) {
  const p = direction.palette;
  const display = getFont(direction.fonts.display);
  return (
    <div
      aria-hidden
      className={cn("relative overflow-hidden", compact ? "h-20" : "h-32", className)}
      style={{ background: p.background, color: p.text, borderRadius: Math.min(direction.radius, 14) }}
    >
      <div className="absolute right-[-18%] top-[-30%] size-[85%] rounded-full opacity-70 blur-2xl" style={{ background: `radial-gradient(circle, ${p.accent}, transparent 65%)` }} />
      <div className="absolute inset-0 flex flex-col justify-between p-3">
        <div
          className={cn("leading-none", compact ? "text-xl" : "text-3xl")}
          style={{ fontFamily: `'${display.family}', ${display.fallback}`, textTransform: direction.displayCase === "uppercase" ? "uppercase" : "none" }}
        >
          Aa
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[10px] opacity-70">
            {direction.fonts.display} / {direction.fonts.body}
          </span>
          <span className="flex gap-1">
            {[p.accent, p.accent2, p.surface].map((c) => (
              <span key={c} className="size-2.5 rounded-full ring-1 ring-black/20" style={{ background: c }} />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
