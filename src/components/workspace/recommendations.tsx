"use client";

import { useCallback, useEffect, useState } from "react";
import { Gauge, Layers, Loader2, Sparkles, Wand2, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DirectionSwatch } from "@/components/shared/direction-card";
import { ModelThumbnail } from "@/components/three/model-thumbnail";
import { getDirection } from "@/lib/catalog/directions";
import type { Recommendation } from "@/lib/recommend/engine";
import { api } from "@/lib/client/api";

interface Props {
  projectId: string;
  prompt: string;
  /** Changes whenever the config or assets change, to refresh recommendations. */
  refreshKey: string;
  manualPaths: Set<string>;
  aiAvailable: boolean;
  onApply: (rec: Recommendation, keepManual: boolean) => void;
}

function touchesManual(rec: Recommendation, manual: Set<string>) {
  return rec.touches.filter((t) => Array.from(manual).some((m) => m === t || m.startsWith(`${t}.`) || t.startsWith(`${m}.`)));
}

export function Recommendations({ projectId, prompt, refreshKey, manualPaths, aiAvailable, onApply }: Props) {
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<string>("off");
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const load = useCallback(
    async (ai: boolean) => {
      setLoading(true);
      try {
        const res = await api<{ recommendations: Recommendation[]; aiStatus: string }>(`/api/projects/${projectId}/recommendations`, { method: "POST", json: { prompt, ai } });
        setRecs(res.recommendations);
        setAiStatus(res.aiStatus);
      } catch {
        setRecs([]);
      } finally {
        setLoading(false);
      }
    },
    [projectId, prompt],
  );

  useEffect(() => {
    const t = setTimeout(() => load(false), 400);
    return () => clearTimeout(t);
  }, [load, refreshKey]);

  return (
    <section aria-labelledby="recs-title" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="recs-title" className="flex items-center gap-1.5 text-sm font-medium"><Sparkles className="size-4 text-primary" aria-hidden /> Recommendations</h3>
        {aiAvailable && (
          <Button variant="ghost" size="xs" onClick={() => load(true)} disabled={loading} title="Free. Tailors explanations to your brief; settings stay rule-based.">
            {loading ? <Loader2 className="animate-spin" /> : <Wand2 />} Tailor with AI
          </Button>
        )}
      </div>
      {aiStatus === "rate_limited" && <p className="text-[11px] text-muted-foreground">AI tailoring limit reached for this hour; showing standard recommendations.</p>}
      {aiStatus === "unavailable" && <p className="text-[11px] text-muted-foreground">AI tailoring is unavailable right now; showing standard recommendations.</p>}
      {!recs ? (
        <div className="space-y-2" aria-busy>
          {[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/40" />)}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {recs.map((r) => {
            const conflicts = touchesManual(r, manualPaths);
            const done = applied.has(r.id);
            return (
              <li key={r.id} className="overflow-hidden rounded-xl border border-border/60 bg-card/50">
                <div className="flex gap-3 p-3">
                  <div className="w-20 shrink-0">
                    {r.preview.kind === "direction" && r.preview.directionId ? (
                      <div className="relative">
                        <DirectionSwatch direction={getDirection(r.preview.directionId)} compact />
                        {r.preview.modelId && <ModelThumbnail modelId={r.preview.modelId} palette={getDirection(r.preview.directionId).palette} className="absolute inset-0 m-auto h-16 w-16" alt="" />}
                      </div>
                    ) : (
                      <div className="grid h-20 place-items-center rounded-md bg-muted/40 text-muted-foreground">
                        {r.preview.kind === "motion" ? <Waves aria-hidden /> : r.preview.kind === "performance" ? <Gauge aria-hidden /> : <Layers aria-hidden />}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug">{r.title}</p>
                      {r.source === "ai" && <Badge variant="outline" className="shrink-0 text-[10px]">AI</Badge>}
                    </div>
                    <p className="text-xs leading-snug text-muted-foreground">{r.explanation}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-border/50 bg-background/40 px-3 py-2">
                  <Button
                    size="xs"
                    variant={done ? "ghost" : "secondary"}
                    onClick={() => {
                      onApply(r, false);
                      setApplied((s) => new Set(s).add(r.id));
                    }}
                  >
                    {done ? "Applied" : "Apply recommendation"}
                  </Button>
                  {conflicts.length > 0 && !done && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        onApply(r, true);
                        setApplied((s) => new Set(s).add(r.id));
                      }}
                    >
                      Apply, keep my choices
                    </Button>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground">Free · doesn&apos;t generate</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
