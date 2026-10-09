"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Check, Circle, Coins, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { estimateEdit, type CostEstimate } from "@/lib/credits/estimate";
import { LIMITS } from "@/config/limits";
import type { CreditSummary, Job, Message } from "@/lib/data/types";
import { STAGE_ORDER, stageLabel } from "./types";
import { cn } from "@/lib/utils";

const EDIT_SUGGESTIONS = ["Make the scroll more dramatic", "Use a different 3D model", "Change the colors to black and gold", "Reduce animation on mobile", "Add a pricing section", "Make the hero feel more luxurious"];

interface Props {
  hasVersion: boolean;
  prompt: string;
  messages: Message[];
  activeJob: Job | null;
  credits: CreditSummary;
  generationEstimate: CostEstimate | null;
  aiLabel: string;
  onGenerate: (prompt: string, cost: number) => Promise<void>;
  onSend: (message: string, cost: number) => Promise<void>;
  onCancel: () => void;
  generationUnavailable: string | null;
}

function JobProgress({ job, onCancel }: { job: Job; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const stage = job.stage.startsWith("repairing") ? "validating" : job.stage === "starting" || job.stage === "retrying" ? "queued" : job.stage;
  const idx = STAGE_ORDER.indexOf(stage);
  const elapsed = Math.max(0, Math.round((now - Date.parse(job.createdAt)) / 1000));
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{job.kind === "generate" ? "Generating your site" : job.kind === "repair" ? "Repairing" : "Applying your edit"}</p>
        <span className="font-mono text-xs text-muted-foreground">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span>
      </div>
      <ol className="mt-2 space-y-1">
        {STAGE_ORDER.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-2 text-xs", i > idx ? "text-muted-foreground" : "text-foreground")}>
            {i < idx ? <Check className="size-3.5 text-primary" /> : i === idx ? <Loader2 className="size-3.5 animate-spin text-primary" /> : <Circle className="size-3.5" />}
            {i === idx ? stageLabel(job.stage) : stageLabel(s)}
          </li>
        ))}
      </ol>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{job.cost ? `${job.cost} credits reserved — returned if this fails` : "Free"}</span>
        <Button size="xs" variant="ghost" onClick={onCancel} disabled={job.cancelRequested}><X /> {job.cancelRequested ? "Canceling…" : "Cancel"}</Button>
      </div>
    </div>
  );
}

export function ChatPanel({ hasVersion, prompt, messages, activeJob, credits, generationEstimate, aiLabel, onGenerate, onSend, onCancel, generationUnavailable }: Props) {
  const [brief, setBrief] = useState(prompt);
  const [draft, setDraft] = useState("");
  const [confirm, setConfirm] = useState<null | { kind: "generate" | "edit"; estimate: CostEstimate; text: string }>(null);
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const editEstimate = useMemo(() => (draft.trim().length > 1 ? estimateEdit(draft) : null), [draft]);

  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView, which must not be used as effect cleanup.
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, activeJob?.stage]);

  const insufficient = (cost: number) => cost > credits.total;

  async function run(kind: "generate" | "edit", text: string, estimate: CostEstimate) {
    setSending(true);
    try {
      if (kind === "generate") await onGenerate(text, estimate.total);
      else {
        await onSend(text, estimate.total);
        setDraft("");
      }
    } finally {
      setSending(false);
      setConfirm(null);
    }
  }

  const visible = messages.filter((m) => !(m.metadata?.kind === "brief" && !hasVersion && !activeJob));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {visible.length === 0 && !hasVersion && (
          <div className="space-y-2 p-1">
            <p className="font-display text-2xl leading-tight">Describe your website</p>
            <p className="text-xs text-muted-foreground">Include what it&apos;s for, who it&apos;s for, and how it should feel. Settings on the right are optional — recommendations fill in the rest.</p>
          </div>
        )}
        {visible.map((m) => (
          <div key={m.id} className={cn("max-w-[92%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed", m.role === "user" ? "ml-auto bg-primary/15" : "bg-muted/50")}>
            {m.role === "assistant" && typeof m.metadata?.version_number === "number" && <span className="mb-1 block text-[10px] uppercase tracking-wider text-primary">Version {m.metadata.version_number as number}</span>}
            {m.content}
          </div>
        ))}
        {activeJob && <JobProgress job={activeJob} onCancel={onCancel} />}
        <div ref={bottom} />
      </div>

      <div className="border-t border-border/60 p-3">
        {generationUnavailable && <p className="mb-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">{generationUnavailable}</p>}
        {!hasVersion ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (generationEstimate) setConfirm({ kind: "generate", estimate: generationEstimate, text: brief.trim() });
            }}
            className="space-y-2"
          >
            <label htmlFor="brief" className="sr-only">Website brief</label>
            <Textarea id="brief" rows={5} value={brief} maxLength={LIMITS.prompt.maxChars} onChange={(e) => setBrief(e.target.value)} placeholder="A launch site for…" className="resize-none text-sm" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">{aiLabel}</span>
              <Button type="submit" disabled={!!activeJob || sending || brief.trim().length < LIMITS.prompt.minChars || !generationEstimate || !!generationUnavailable}>
                Generate {generationEstimate && <span className="inline-flex items-center gap-1 rounded bg-black/15 px-1.5 text-xs"><Coins className="size-3" />{generationEstimate.total}</span>}
              </Button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editEstimate) return;
              if (editEstimate.action === "edit-major" || insufficient(editEstimate.total)) setConfirm({ kind: "edit", estimate: editEstimate, text: draft.trim() });
              else run("edit", draft.trim(), editEstimate);
            }}
            className="space-y-2"
          >
            {!draft && (
              <div className="flex flex-wrap gap-1.5" aria-label="Suggested edits">
                {EDIT_SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => setDraft(s)} className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground">{s}</button>
                ))}
              </div>
            )}
            <div className="relative">
              <label htmlFor="chat" className="sr-only">Describe a change</label>
              <Textarea
                id="chat"
                rows={2}
                value={draft}
                maxLength={LIMITS.chatMessageMaxChars}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Ask for a change…"
                className="resize-none pr-12 text-sm"
              />
              <Button type="submit" size="icon-sm" className="absolute bottom-2 right-2" aria-label="Send" disabled={!!activeJob || sending || !editEstimate || !!generationUnavailable}>
                {sending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
              </Button>
            </div>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground" aria-live="polite">
              {editEstimate ? (
                <>
                  <Coins className="size-3 text-primary" /> {editEstimate.action === "edit-major" ? "Major redesign" : "Targeted edit"} · {editEstimate.total} credits · {credits.total} available
                </>
              ) : (
                <>Edits cost credits; the exact cost shows here before you send.</>
              )}
            </p>
          </form>
        )}
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          {confirm && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{confirm.kind === "generate" ? "Generate website?" : confirm.estimate.action === "edit-major" ? "Redesign the site?" : "Send edit?"}</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p>{confirm.estimate.explanation}</p>
                    <ul className="rounded-lg border border-border/60 text-sm text-foreground">
                      {confirm.estimate.lines.map((l) => (
                        <li key={l.label} className="flex justify-between border-b border-border/40 px-3 py-2 last:border-0"><span>{l.label}</span><span className="font-mono">{l.credits}</span></li>
                      ))}
                      <li className="flex justify-between bg-muted/40 px-3 py-2 font-medium"><span>Total</span><span className="font-mono">{confirm.estimate.total} credits</span></li>
                    </ul>
                    <p className="text-xs">
                      Balance: {credits.total} credits{insufficient(confirm.estimate.total) ? " — not enough for this action." : `, ${credits.total - confirm.estimate.total} after this.`} Credits are reserved now and only charged if the version is saved.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                {insufficient(confirm.estimate.total) ? (
                  <AlertDialogAction asChild><Link href="/billing">Get credits</Link></AlertDialogAction>
                ) : (
                  <AlertDialogAction onClick={(e) => { e.preventDefault(); run(confirm.kind, confirm.text, confirm.estimate); }} disabled={sending}>
                    {sending && <Loader2 className="animate-spin" />} Use {confirm.estimate.total} credits
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
