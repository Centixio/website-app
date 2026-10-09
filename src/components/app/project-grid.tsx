"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ProjectThumb } from "./project-thumb";
import { api } from "@/lib/client/api";
import type { ProjectSummary } from "@/lib/data/types";

const STARTERS = [
  "A launch site for a luxury perfume called “Nocturne” with warm amber notes, for women 25–45.",
  "A landing page for an AI note-taking app for product teams, with pricing and FAQ.",
  "A portfolio for an architecture studio that works with timber and natural light.",
  "A teaser site for a dark-fantasy action game launching next spring.",
];

function relTime(iso: string) {
  const d = (Date.now() - Date.parse(iso)) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: d > 31536000 ? "numeric" : undefined });
}

export function ProjectGrid({ initial }: { initial: ProjectSummary[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initial);
  const [creating, setCreating] = useState(initial.length === 0);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [, startTransition] = useTransition();

  async function create() {
    setBusy(true);
    try {
      const { project } = await api<{ project: ProjectSummary }>("/api/projects", { method: "POST", json: { prompt: prompt.trim() } });
      router.push(`/projects/${project.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  async function rename() {
    if (!renaming) return;
    try {
      await api(`/api/projects/${renaming.id}`, { method: "PATCH", json: { name: newName } });
      setProjects((ps) => ps.map((p) => (p.id === renaming.id ? { ...p, name: newName } : p)));
      setRenaming(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function duplicate(p: ProjectSummary) {
    try {
      const { project } = await api<{ project: ProjectSummary }>(`/api/projects/${p.id}/duplicate`, { method: "POST" });
      setProjects((ps) => [project, ...ps]);
      toast.success(`Duplicated “${p.name}”`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove() {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    try {
      await api(`/api/projects/${target.id}`, { method: "DELETE" });
      setProjects((ps) => ps.filter((p) => p.id !== target.id));
      startTransition(() => router.refresh());
      toast.success(`Deleted “${target.name}”`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">{projects.length ? `${projects.length} project${projects.length === 1 ? "" : "s"}` : "Start by describing a website."}</p>
        </div>
        <Button size="lg" onClick={() => setCreating(true)}>
          <Plus /> New project
        </Button>
      </div>

      {projects.length > 0 ? (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id} className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/40 transition-colors hover:border-primary/40">
              <Link href={`/projects/${p.id}`} className="block rounded-2xl focus-visible:outline-offset-[-2px]" aria-label={`Open ${p.name}`}>
                <ProjectThumb thumb={p.thumb} name={p.name} />
                <div className="p-4 pr-12">
                  <h2 className="truncate font-medium">{p.name}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Updated {relTime(p.updatedAt)}{p.currentVersionId ? "" : " · draft"}</p>
                </div>
              </Link>
              <div className="absolute bottom-3 right-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${p.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => { setRenaming(p); setNewName(p.name); }}><Pencil /> Rename</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => duplicate(p)}><Copy /> Duplicate</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(p)}><Trash2 /> Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">No projects yet.</div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-3xl font-normal">Describe your website</DialogTitle>
            <DialogDescription>What is it for, who is it for, and how should it feel? You&apos;ll review recommendations and see the cost before anything is generated.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="brief" className="sr-only">Website description</Label>
            <Textarea id="brief" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} placeholder="A launch site for…" className="text-base" maxLength={4000} />
            <div className="flex flex-wrap gap-2" aria-label="Example briefs">
              {STARTERS.map((s) => (
                <button key={s} type="button" onClick={() => setPrompt(s)} className="rounded-full border border-border px-3 py-1 text-left text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground">
                  {s.slice(0, 48)}…
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} {prompt.trim() ? "Create project" : "Create empty project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename project</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); rename(); }} className="space-y-4">
            <Label htmlFor="rename">Name</Label>
            <Input id="rename" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} autoFocus />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
              <Button type="submit" disabled={!newName.trim()}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes the project, its versions, chat history and uploaded files. Credits already spent are not refunded.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-white hover:bg-destructive/90">Delete project</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
