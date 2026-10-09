"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle, Download, Expand, Loader2, Monitor, RotateCw, Smartphone, Tablet, Undo2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, newIdempotencyKey } from "@/lib/client/api";
import type { VersionSummary } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const BridgeMessage = z.object({
  source: z.literal("centixio-preview"),
  nonce: z.string().min(16).max(64),
  type: z.enum(["ready", "error", "info", "navigation-blocked"]),
  message: z.string().max(600).optional(),
  where: z.string().max(300).optional(),
  severity: z.string().max(20).optional(),
  href: z.string().max(300).optional(),
  webgl: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
});
const ShellMessage = z.object({ source: z.literal("centixio-shell"), type: z.literal("shell-ready") });

// Desktop renders at least 1280px wide (scaled to fit) so sites show their real desktop layout.
const DEVICES = { desktop: { w: 1280, label: "Desktop" }, tablet: { w: 834, label: "Tablet" }, mobile: { w: 390, label: "Mobile" } } as const;
type Device = keyof typeof DEVICES;

interface Props {
  projectId: string;
  versions: VersionSummary[];
  currentVersionId: string | null;
  viewedVersionId: string | null;
  onViewVersion: (id: string) => void;
  onRestored: () => void;
  onRepairStarted: (jobId: string) => void;
  defaultFormat: "zip" | "single-html";
  /** Shown over the preview while a job is running. */
  busyLabel: string | null;
  onPreviewReady?: () => void;
  creditsSlot?: React.ReactNode;
}

function relTime(iso: string) {
  const d = (Date.now() - Date.parse(iso)) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function PreviewPane({ projectId, versions, currentVersionId, viewedVersionId, onViewVersion, onRestored, onRepairStarted, defaultFormat, busyLabel, onPreviewReady, creditsSlot }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const html = useRef<string | null>(null);
  const nonce = useRef<string | null>(null);
  const reported = useRef<string | null>(null);
  const [device, setDevice] = useState<Device>(() => (typeof window !== "undefined" && window.innerWidth < 768 ? "mobile" : "desktop"));
  const [loading, setLoading] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [errors, setErrors] = useState<{ message: string; where?: string }[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const viewed = versions.find((v) => v.id === viewedVersionId) ?? null;
  const isCurrent = viewedVersionId === currentVersionId;

  const load = useCallback(async () => {
    if (!viewedVersionId) return;
    setLoading(true);
    setErrors([]);
    setInfo(null);
    try {
      const res = await api<{ html: string; nonce: string }>(`/api/projects/${projectId}/versions/${viewedVersionId}/preview`);
      html.current = res.html;
      nonce.current = res.nonce;
      setFrameKey((k) => k + 1);
    } catch (e) {
      toast.error(`Preview failed: ${(e as Error).message}`);
      setLoading(false);
    }
  }, [projectId, viewedVersionId]);

  useEffect(() => {
    // Fetching the preview document when the viewed version changes is synchronization with the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Message bridge: accept only messages from our iframe, with the per-render nonce and a valid shape.
  useEffect(() => {
    const errs: { message: string; where?: string }[] = [];
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    const report = (status: "ok" | "errors") => {
      const key = `${viewedVersionId}:${status}:${errs.length}`;
      if (!viewedVersionId || reported.current === key) return;
      reported.current = key;
      api(`/api/projects/${projectId}/versions/${viewedVersionId}/runtime-report`, { method: "POST", json: { status, errors: errs.slice(0, 20) } }).catch(() => {});
    };
    function onMessage(e: MessageEvent) {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const shell = ShellMessage.safeParse(e.data);
      if (shell.success) {
        if (html.current) frame.current.contentWindow?.postMessage({ source: "centixio-app", type: "render", html: html.current }, "*");
        return;
      }
      const msg = BridgeMessage.safeParse(e.data);
      if (!msg.success || msg.data.nonce !== nonce.current) return;
      const d = msg.data;
      if (d.type === "ready") {
        setLoading(false);
        onPreviewReady?.();
        if (d.webgl === false) setInfo("This browser has no WebGL, so 3D areas show their static fallback.");
        readyTimer = setTimeout(() => report(errs.length ? "errors" : "ok"), 4000);
      } else if (d.type === "error") {
        if (d.severity === "warning") {
          setInfo(d.message ?? null);
          return;
        }
        errs.push({ message: d.message ?? "Unknown error", where: d.where });
        setErrors([...errs]);
        if (readyTimer) {
          clearTimeout(readyTimer);
          readyTimer = setTimeout(() => report("errors"), 1500);
        }
      } else if (d.type === "navigation-blocked") {
        toast.message("Links open only in the downloaded site", { description: d.href });
      } else if (d.type === "info" && d.message) {
        setInfo(d.message);
      }
    }
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (readyTimer) clearTimeout(readyTimer);
    };
  }, [projectId, viewedVersionId, onPreviewReady, frameKey]);

  // Scale tablet/mobile frames down to fit the available space.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = DEVICES[device].w;
      const pad = device === "desktop" ? 0 : 32;
      setScale(Math.min(1, (el.clientWidth - pad) / w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [device]);

  async function restore() {
    if (!viewedVersionId) return;
    try {
      await api(`/api/projects/${projectId}/versions/${viewedVersionId}/restore`, { method: "POST" });
      toast.success(`Restored version ${viewed?.number}`);
      onRestored();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function repair() {
    if (!viewedVersionId) return;
    try {
      const { job } = await api<{ job: { id: string } }>(`/api/projects/${projectId}/versions/${viewedVersionId}/repair`, { method: "POST", json: { idempotencyKey: newIdempotencyKey("repair") } });
      onRepairStarted(job.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const exportUrl = (format: string) => `/api/projects/${projectId}/versions/${viewedVersionId}/export?format=${format}`;
  // Desktop fills the pane when it is wide enough; otherwise it renders at 1280px and scales down.
  const fillDesktop = device === "desktop" && scale >= 1;
  const w = fillDesktop ? 0 : DEVICES[device].w;
  const framed = device !== "desktop";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
        <ToggleGroup type="single" value={device} onValueChange={(v) => v && setDevice(v as Device)} variant="outline" size="sm" aria-label="Preview size">
          <ToggleGroupItem value="desktop" aria-label="Desktop"><Monitor /></ToggleGroupItem>
          <ToggleGroupItem value="tablet" aria-label="Tablet"><Tablet /></ToggleGroupItem>
          <ToggleGroupItem value="mobile" aria-label="Mobile"><Smartphone /></ToggleGroupItem>
        </ToggleGroup>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={load} disabled={!viewedVersionId} aria-label="Reload preview"><RotateCw /></Button>
          </TooltipTrigger>
          <TooltipContent>Reload preview</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={() => container.current?.requestFullscreen?.()} disabled={!viewedVersionId} aria-label="Fullscreen preview"><Expand /></Button>
          </TooltipTrigger>
          <TooltipContent>Fullscreen</TooltipContent>
        </Tooltip>

        <div className="ml-auto flex items-center gap-2">
          {versions.length > 0 && (
            <Select value={viewedVersionId ?? undefined} onValueChange={onViewVersion}>
              <SelectTrigger size="sm" className="w-[11.5rem]" aria-label="Version history"><SelectValue placeholder="Versions" /></SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    <span className="tabular-nums">v{v.number}</span>
                    <span className="text-muted-foreground"> · {v.kind}{v.creditCharge ? ` · ${v.creditCharge} cr` : ""} · {relTime(v.createdAt)}{v.id === currentVersionId ? " · current" : ""}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {viewed && !isCurrent && (
            <Button size="sm" variant="secondary" onClick={restore}><Undo2 /> Restore v{viewed.number}</Button>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" disabled={!viewedVersionId}><Download /> Download</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-3">
              <p className="text-sm font-medium">Download v{viewed?.number} — free</p>
              {(["zip", "single-html"] as const).map((f) => (
                <a key={f} href={exportUrl(f)} download className={cn("block rounded-lg border p-3 text-sm hover:border-primary/60", f === defaultFormat ? "border-primary/50" : "border-border")}>
                  <span className="font-medium">{f === "zip" ? "ZIP package" : "Single HTML file"}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {f === "zip" ? "index.html, assets/, vendor/ (three.js, GSAP) and a README on hosting. Works offline; Google Fonts load when online." : "One file with scripts and assets embedded. Works offline except Google Fonts. Not available if your assets exceed 12 MB."}
                  </span>
                </a>
              ))}
              <p className="text-[11px] text-muted-foreground">Static site: no server code. Forms only work if you configured a form endpoint.</p>
            </PopoverContent>
          </Popover>
          {creditsSlot}
        </div>
      </div>

      {errors.length > 0 && (
        <div role="alert" className="flex items-start gap-3 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 flex-1">
            <p>The preview reported {errors.length} runtime error{errors.length > 1 ? "s" : ""}.</p>
            <p className="truncate text-xs text-muted-foreground">{errors[0].message}</p>
          </div>
          {isCurrent && <Button size="sm" variant="outline" onClick={repair}><Wrench /> Repair (free)</Button>}
        </div>
      )}
      {info && errors.length === 0 && <div className="border-b border-border/60 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">{info}</div>}

      <div ref={container} className="relative min-h-0 flex-1 overflow-hidden bg-[#0a0a0b]">
        {!viewedVersionId ? (
          <div className="grid h-full place-items-center p-8 text-center">
            <div className="max-w-sm space-y-2">
              <p className="font-display text-3xl">Your preview appears here</p>
              <p className="text-sm text-muted-foreground">Describe the website in the chat, review the recommended settings, and generate when you&apos;re ready.</p>
            </div>
          </div>
        ) : (
          <div className={cn("flex h-full", device === "desktop" ? "justify-start" : "justify-center")} style={{ padding: framed ? 16 : 0 }}>
            <div style={w ? { width: w, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: device === "desktop" ? "top left" : "top center", flexShrink: 0 } : { width: "100%", height: "100%" }} className={cn(framed && "overflow-hidden rounded-xl border border-border/60 shadow-2xl")}>
              <iframe
                key={frameKey}
                ref={frame}
                title={`Preview of version ${viewed?.number ?? ""}`}
                src="/preview-frame"
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
                className="size-full border-0 bg-white"
              />
            </div>
          </div>
        )}
        {(loading || busyLabel) && viewedVersionId && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <span className="flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs text-white backdrop-blur" role="status">
              <Loader2 className="size-3.5 animate-spin" /> {busyLabel ?? "Preparing preview"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
