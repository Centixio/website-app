"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { ChevronLeft, Coins, FolderOpen, Loader2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LogoMark } from "@/components/brand/logo";
import { deepMerge, type WebsiteConfig } from "@/lib/config-schema";
import { diffConfig, estimateGeneration } from "@/lib/credits/estimate";
import type { Recommendation } from "@/lib/recommend/engine";
import type { Job, ProjectSummary } from "@/lib/data/types";
import { api, ApiError, newIdempotencyKey } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { ChatPanel } from "./chat-panel";
import { ConfigPanel } from "./config-panel";
import { PreviewPane } from "./preview-pane";
import { Recommendations } from "./recommendations";
import { stageLabel, type PublicAsset, type WorkspaceState } from "./types";

interface Props {
  initial: WorkspaceState;
  aiLabel: string;
  aiAvailable: boolean;
  generationUnavailable: string | null;
  demo: boolean;
}

function flatten(obj: unknown, prefix = "", out: Record<string, string> = {}) {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else out[prefix] = JSON.stringify(obj);
  return out;
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
}
function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
  o[keys[keys.length - 1]] = structuredClone(value);
}

const TERMINAL = new Set(["completed", "failed", "canceled"]);

/** Render exactly one layout (not CSS-hidden duplicates) so there is one preview iframe and unique ids. */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 1024px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true,
  );
}

export function Workspace({ initial, aiLabel, aiAvailable, generationUnavailable, demo }: Props) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [config, setConfig] = useState<WebsiteConfig>(initial.config.config);
  const [manual, setManual] = useState<Set<string>>(new Set());
  const [viewedVersionId, setViewedVersionId] = useState<string | null>(initial.project.currentVersionId);
  const [activeJob, setActiveJob] = useState<Job | null>(initial.jobs[0] ?? null);
  const [mobileTab, setMobileTab] = useState<"chat" | "preview" | "settings">(initial.project.currentVersionId ? "preview" : "chat");
  const [showNav, setShowNav] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(true);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [applyConfirm, setApplyConfirm] = useState(false);
  const [applying, setApplying] = useState(false);
  const saveSeq = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectId = state.project.id;
  const isDesktop = useIsDesktop();

  const refresh = useCallback(async () => {
    const next = await api<WorkspaceState>(`/api/projects/${projectId}/state`);
    setState(next);
    setActiveJob(next.jobs[0] ?? null);
    return next;
  }, [projectId]);

  // ---------------------------------------------------------------- config editing
  const persist = useCallback(
    (next: WebsiteConfig) => {
      const seq = ++saveSeq.current;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        saveTimer.current = null;
        try {
          const res = await api<WorkspaceState["config"] & { notes: string[] }>(`/api/projects/${projectId}/config`, { method: "PUT", json: { config: next } });
          // Only adopt server corrections if nothing changed locally since this save.
          if (seq === saveSeq.current) {
            setConfig(res.config);
            setState((s) => ({ ...s, config: { config: res.config, appliedConfig: res.appliedConfig, updatedAt: res.updatedAt, diff: res.diff } }));
          }
        } catch (e) {
          toast.error(`Settings not saved: ${(e as Error).message}`);
        }
      }, 500);
    },
    [projectId],
  );

  const patch = useCallback(
    (fn: (c: WebsiteConfig) => void) => {
      setConfig((prev) => {
        const next = structuredClone(prev);
        fn(next);
        const a = flatten(prev);
        const b = flatten(next);
        const changed = Object.keys(b).filter((k) => a[k] !== b[k]);
        if (changed.length) setManual((m) => new Set([...m, ...changed]));
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const applyRecommendation = useCallback(
    (rec: Recommendation, keepManual: boolean) => {
      setConfig((prev) => {
        const next = deepMerge(structuredClone(prev), rec.patch) as WebsiteConfig;
        if (keepManual) for (const p of manual) setPath(next as unknown as Record<string, unknown>, p, getPath(prev as unknown as Record<string, unknown>, p));
        persist(next);
        return next;
      });
      toast.success(`Applied: ${rec.title}`, { description: "Settings updated. Nothing was generated or charged." });
    },
    [manual, persist],
  );

  const onAssetUploaded = useCallback((a: PublicAsset) => setState((s) => ({ ...s, assets: [...s.assets, a] })), []);
  const onAssetDeleted = useCallback((id: string) => setState((s) => ({ ...s, assets: s.assets.filter((x) => x.id !== id) })), []);

  // ---------------------------------------------------------------- jobs
  useEffect(() => {
    if (!activeJob || TERMINAL.has(activeJob.status)) return;
    let stopped = false;
    const tick = async () => {
      try {
        const { job } = await api<{ job: Job }>(`/api/jobs/${activeJob.id}`);
        if (stopped) return;
        if (TERMINAL.has(job.status)) {
          const next = await refresh();
          setActiveJob(null);
          if (job.status === "completed") {
            // Edits sync settings to the new version on the server; adopt them unless the user is mid-edit.
            if (!saveTimer.current) setConfig(next.config.config);
            setViewedVersionId(next.project.currentVersionId);
            setMobileTab("preview");
            toast.success(job.kind === "generate" ? "Your site is ready" : "Changes applied");
          } else if (job.status === "failed") {
            toast.error(job.error ?? "Generation failed", { description: job.cost ? `The ${job.cost} reserved credits were returned.` : undefined, duration: 10000 });
          } else toast.message("Canceled", { description: job.cost ? "Reserved credits were returned." : undefined });
          router.refresh();
          return;
        }
        setActiveJob((j) => (j && j.id === job.id ? { ...j, ...job } : j));
      } catch {
        /* transient; keep polling */
      }
      if (!stopped) timer = setTimeout(tick, 1200);
    };
    let timer = setTimeout(tick, 800);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [activeJob, refresh, router]);

  const handleJobStart = useCallback(
    async (fn: () => Promise<{ job: Job }>) => {
      try {
        const { job } = await fn();
        setActiveJob(job);
        await refresh().then((n) => setActiveJob(n.jobs.find((j) => j.id === job.id) ?? job));
      } catch (e) {
        if (e instanceof ApiError && e.code === "insufficient_credits") toast.error(e.message, { action: { label: "Get credits", onClick: () => router.push("/billing") } });
        else if (e instanceof ApiError && e.code === "cost_changed") toast.error(e.message);
        else toast.error((e as Error).message);
        throw e;
      }
    },
    [refresh, router],
  );

  const onGenerate = useCallback(
    async (prompt: string, cost: number) => {
      // Flush pending settings first so the job uses exactly what the user sees.
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        await api(`/api/projects/${projectId}/config`, { method: "PUT", json: { config } });
      }
      await handleJobStart(() => api(`/api/projects/${projectId}/generate`, { method: "POST", json: { prompt, idempotencyKey: newIdempotencyKey("gen"), expectedCost: cost } })).catch(() => {});
    },
    [config, handleJobStart, projectId],
  );

  const onSend = useCallback(
    async (message: string, cost: number) => {
      await handleJobStart(() => api(`/api/projects/${projectId}/messages`, { method: "POST", json: { message, idempotencyKey: newIdempotencyKey("edit"), expectedCost: cost } })).catch(() => {});
    },
    [handleJobStart, projectId],
  );

  const onCancel = useCallback(async () => {
    if (!activeJob) return;
    try {
      const { status } = await api<{ status: string }>(`/api/jobs/${activeJob.id}/cancel`, { method: "POST" });
      setActiveJob((j) => (j ? { ...j, cancelRequested: true, status: status === "canceled" ? "canceled" : j.status } : j));
      if (status === "canceled") {
        setActiveJob(null);
        refresh();
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [activeJob, refresh]);

  // ---------------------------------------------------------------- unapplied settings
  const hasVersion = Boolean(state.project.currentVersionId);
  const diff = useMemo(() => diffConfig(state.config.appliedConfig, config), [state.config.appliedConfig, config]);
  const genEstimate = useMemo(() => estimateGeneration(config), [config]);

  async function applySettings() {
    setApplying(true);
    try {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        await api(`/api/projects/${projectId}/config`, { method: "PUT", json: { config } });
      }
      const res = await api<{ kind: string; job?: Job; versionId?: string }>(`/api/projects/${projectId}/apply-config`, { method: "POST", json: { idempotencyKey: newIdempotencyKey("apply"), expectedCost: diff.estimate?.total ?? 0 } });
      if (res.kind === "job" && res.job) {
        setActiveJob(res.job);
        await refresh();
      } else if (res.kind === "version") {
        const next = await refresh();
        setViewedVersionId(next.project.currentVersionId);
        toast.success("Settings applied", { description: "Re-assembled without AI. No credits used." });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setApplying(false);
      setApplyConfirm(false);
    }
  }

  async function openNav() {
    setNavOpen(true);
    if (!projects) {
      try {
        setProjects((await api<{ projects: ProjectSummary[] }>("/api/projects")).projects);
      } catch {
        setProjects([]);
      }
    }
  }

  const refreshKey = useMemo(() => `${config.purpose}|${config.brand.description}|${config.brand.audience}|${state.assets.length}|${config.output.format}|${config.scene.quality}`, [config, state.assets.length]);

  const creditPill = (
    <Link href="/billing" className="hidden items-center gap-1 rounded-full border border-border/70 px-2.5 py-1 text-xs hover:border-primary/50 md:inline-flex" aria-label={`${state.credits.total} credits available`}>
      <Coins className="size-3.5 text-primary" aria-hidden /> <span className="tabular-nums">{state.credits.total}</span>
      {state.credits.held > 0 && <span className="text-muted-foreground">· {state.credits.held} reserved</span>}
      {demo && <span className="text-muted-foreground">demo</span>}
    </Link>
  );

  const unappliedBar = hasVersion && diff.tier !== "none" && (
    <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/10 p-3" role="status">
      <p className="text-sm font-medium">Unapplied changes</p>
      <p className="text-xs text-muted-foreground">{diff.explanation}</p>
      <Button size="sm" className="w-full" disabled={applying || !!activeJob} onClick={() => (diff.estimate && diff.estimate.total > 0 ? setApplyConfirm(true) : applySettings())}>
        {applying && <Loader2 className="animate-spin" />}
        {diff.estimate && diff.estimate.total > 0 ? `Apply changes · ${diff.estimate.total} credits` : "Apply changes · free"}
      </Button>
    </div>
  );

  const settingsColumn = (
    <div className="space-y-5 p-3">
      {unappliedBar}
      <Recommendations projectId={projectId} prompt={state.project.prompt || config.brand.description} refreshKey={refreshKey} manualPaths={manual} aiAvailable={aiAvailable} onApply={applyRecommendation} />
      <div>
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-medium"><SlidersHorizontal className="size-4 text-primary" aria-hidden /> Settings</h3>
        <p className="mb-2 text-[11px] text-muted-foreground">Changes are saved automatically and don&apos;t cost anything until you generate or apply them.</p>
        <ConfigPanel projectId={projectId} config={config} patch={patch} assets={state.assets} onAssetUploaded={onAssetUploaded} onAssetDeleted={onAssetDeleted} />
      </div>
    </div>
  );

  const chat = (
    <ChatPanel
      hasVersion={hasVersion}
      prompt={state.project.prompt}
      messages={state.messages}
      activeJob={activeJob}
      credits={state.credits}
      generationEstimate={genEstimate}
      aiLabel={aiLabel}
      onGenerate={onGenerate}
      onSend={onSend}
      onCancel={onCancel}
      generationUnavailable={generationUnavailable}
    />
  );

  const preview = (
    <PreviewPane
      projectId={projectId}
      versions={state.versions}
      currentVersionId={state.project.currentVersionId}
      viewedVersionId={viewedVersionId}
      onViewVersion={setViewedVersionId}
      onRestored={async () => {
        const next = await refresh();
        setConfig(next.config.config);
        setViewedVersionId(next.project.currentVersionId);
      }}
      onRepairStarted={async (jobId) => {
        const next = await refresh();
        setActiveJob(next.jobs.find((j) => j.id === jobId) ?? null);
      }}
      defaultFormat={config.output.format}
      busyLabel={activeJob ? stageLabel(activeJob.stage) : null}
      creditsSlot={creditPill}
    />
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-2">
        <Button variant="ghost" size="icon-sm" className="hidden lg:inline-flex" onClick={() => setShowNav((v) => !v)} aria-label={showNav ? "Hide projects" : "Show projects"} aria-expanded={showNav}>
          {showNav ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>
        <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={openNav} aria-label="Projects">
          <FolderOpen />
        </Button>
        <Link href="/dashboard" className="flex items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> <LogoMark className="size-5" />
        </Link>
        <h1 className="min-w-0 truncate text-sm font-medium">{state.project.name}</h1>
        {activeJob && <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex"><Loader2 className="size-3 animate-spin" />{stageLabel(activeJob.stage)}</span>}
        <div className="ml-auto flex items-center gap-1">
          {demo && <span className="hidden rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary sm:inline">Demo mode</span>}
          <Button variant="ghost" size="icon-sm" className="hidden lg:inline-flex" onClick={() => setConfigOpen((v) => !v)} aria-label={configOpen ? "Hide settings" : "Show settings"} aria-expanded={configOpen}>
            {configOpen ? <PanelRightClose /> : <PanelRightOpen />}
          </Button>
        </div>
      </header>

      {isDesktop ? (
        <div className="flex min-h-0 flex-1">
          {showNav && <ProjectRail currentId={projectId} />}
          <aside aria-label="Conversation" className="flex w-[340px] shrink-0 flex-col border-r border-border/60 xl:w-[380px]">{chat}</aside>
          <section aria-label="Live preview" className="min-w-0 flex-1">{preview}</section>
          {configOpen && <aside aria-label="Configuration" className="w-[360px] shrink-0 overflow-y-auto border-l border-border/60 xl:w-[400px]">{settingsColumn}</aside>}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as typeof mobileTab)} className="border-b border-border/60 px-2 py-1.5">
            <TabsList className="w-full">
              <TabsTrigger value="chat">Chat</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="settings">Settings{diff.tier !== "none" && hasVersion ? " •" : ""}</TabsTrigger>
            </TabsList>
          </Tabs>
          {/* Keep the preview mounted while switching tabs so it doesn't reload. */}
          <div className={cn("min-h-0 flex-1", mobileTab !== "chat" && "hidden")}>{chat}</div>
          <div className={cn("min-h-0 flex-1", mobileTab !== "preview" && "hidden")}>{preview}</div>
          {mobileTab === "settings" && <div className="min-h-0 flex-1 overflow-y-auto">{settingsColumn}</div>}
        </div>
      )}

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-80">
          <SheetHeader><SheetTitle>Projects</SheetTitle></SheetHeader>
          <ProjectList projects={projects} currentId={projectId} />
        </SheetContent>
      </Sheet>

      <AlertDialog open={applyConfirm} onOpenChange={setApplyConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply changes for {diff.estimate?.total} credits?</AlertDialogTitle>
            <AlertDialogDescription>{diff.explanation} Balance: {state.credits.total} credits. Credits are only charged if the new version is saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); applySettings(); }} disabled={applying || (diff.estimate?.total ?? 0) > state.credits.total}>
              {(diff.estimate?.total ?? 0) > state.credits.total ? "Not enough credits" : `Use ${diff.estimate?.total} credits`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProjectList({ projects, currentId }: { projects: ProjectSummary[] | null; currentId: string }) {
  if (!projects) return <div className="p-4"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  return (
    <nav aria-label="Projects" className="space-y-1 p-2">
      <Link href="/dashboard" className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"><Plus className="size-4" /> New project</Link>
      {projects.map((p) => (
        <Link key={p.id} href={`/projects/${p.id}`} aria-current={p.id === currentId ? "page" : undefined} className={cn("block truncate rounded-md px-2 py-2 text-sm hover:bg-muted", p.id === currentId ? "bg-muted text-foreground" : "text-muted-foreground")}>
          {p.name}
        </Link>
      ))}
    </nav>
  );
}

function ProjectRail({ currentId }: { currentId: string }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  useEffect(() => {
    api<{ projects: ProjectSummary[] }>("/api/projects").then((r) => setProjects(r.projects), () => setProjects([]));
  }, []);
  return (
    <aside aria-label="Project navigation" className="w-56 shrink-0 overflow-y-auto border-r border-border/60 bg-sidebar">
      <ProjectList projects={projects} currentId={currentId} />
    </aside>
  );
}
