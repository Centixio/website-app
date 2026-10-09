import Link from "next/link";
import { Coins } from "lucide-react";
import type { CreditSummary } from "@/lib/data/types";

export function CreditBadge({ credits, demo }: { credits: CreditSummary; demo?: boolean }) {
  return (
    <Link
      href="/billing"
      className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-sm hover:border-primary/50"
      aria-label={`${credits.total} credits available${credits.held ? `, ${credits.held} reserved` : ""}${demo ? " (demo credits)" : ""}. Open billing.`}
    >
      <Coins className="size-4 text-primary" aria-hidden />
      <span className="tabular-nums">{credits.total}</span>
      <span className="text-muted-foreground">{demo ? "demo credits" : "credits"}</span>
    </Link>
  );
}
