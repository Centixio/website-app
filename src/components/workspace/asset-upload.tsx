"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Box, ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PublicAsset } from "./types";

const ACCEPT: Record<PublicAsset["kind"], string> = {
  image: "image/png,image/jpeg,image/webp,image/gif",
  logo: "image/png,image/jpeg,image/webp",
  reference: "image/png,image/jpeg,image/webp",
  favicon: "image/png,image/x-icon,image/vnd.microsoft.icon",
  social: "image/png,image/jpeg,image/webp",
  model: ".glb,.gltf,model/gltf-binary,model/gltf+json",
};

export function AssetUpload({
  projectId,
  kind,
  assets,
  multiple = false,
  label,
  hint,
  onUploaded,
  onDeleted,
}: {
  projectId: string;
  kind: PublicAsset["kind"];
  assets: PublicAsset[];
  multiple?: boolean;
  label: string;
  hint?: string;
  onUploaded: (a: PublicAsset) => void;
  onDeleted: (id: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const mine = assets.filter((a) => a.kind === kind);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", kind);
      try {
        const res = await fetch(`/api/projects/${projectId}/assets`, { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message ?? "Upload failed");
        onUploaded(data.asset);
        if (kind === "model") {
          toast.success(data.asset.meta.separable ? `Model uploaded: ${data.asset.meta.meshCount} parts, exploded view available.` : "Model uploaded: single surface, so exploded view is not available.");
        }
      } catch (e) {
        toast.error(`${file.name}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  async function remove(id: string) {
    const res = await fetch(`/api/projects/${projectId}/assets/${id}`, { method: "DELETE" });
    if (res.ok) onDeleted(id);
    else toast.error("Could not delete the file.");
  }

  const Icon = kind === "model" ? Box : ImageIcon;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">{label}</span>
        <Button type="button" variant="outline" size="sm" disabled={busy || (!multiple && mine.length > 0)} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="animate-spin" /> : <Upload />} Upload
        </Button>
        <input ref={input} type="file" accept={ACCEPT[kind]} multiple={multiple} className="sr-only" aria-label={label} onChange={(e) => upload(e.target.files)} />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {mine.length > 0 && (
        <ul className="space-y-1">
          {mine.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-xs">
              <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {kind === "model" ? (a.meta.separable ? `${a.meta.meshCount} parts` : "1 surface") : a.meta.width ? `${a.meta.width}×${a.meta.height}` : ""}
              </span>
              <Button type="button" variant="ghost" size="icon-xs" aria-label={`Delete ${a.name}`} onClick={() => remove(a.id)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
