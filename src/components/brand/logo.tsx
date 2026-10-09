import { cn } from "@/lib/utils";
import { brand } from "@/config/brand";

/** Centixio mark: an open ring (the "C") orbiting a solid sphere — an object in a space. */
export function LogoMark({ className, title = brand.name }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" role="img" aria-label={title} className={cn("size-7", className)}>
      <path d="M46.55 19.79A19 19 0 1 0 46.55 44.21" stroke={brand.colors.accent} strokeWidth="6.5" strokeLinecap="round" />
      <circle cx="30.5" cy="32" r="7.25" fill={brand.colors.ivory} />
      <circle cx="52.5" cy="32" r="3.25" fill={brand.colors.accent} />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="font-display text-[1.45rem] leading-none tracking-tight lowercase">{brand.name}</span>
    </span>
  );
}
