"use client";

import { useId } from "react";
import { ArrowDown, ArrowUp, Info } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DirectionSwatch } from "@/components/shared/direction-card";
import { ModelThumbnail } from "@/components/three/model-thumbnail";
import { PURPOSES, SECTION_TYPES, resolveConflicts, type SectionType, type WebsiteConfig } from "@/lib/config-schema";
import { VISUAL_DIRECTIONS, getDirection } from "@/lib/catalog/directions";
import { CAMERA_FRAMINGS, LIGHTING_PRESETS, MATERIAL_PRESETS, MODELS, getModel } from "@/lib/catalog/models";
import { FONT_PAIRINGS } from "@/lib/catalog/fonts";
import { sectionName } from "@/lib/recommend/engine";
import { cn } from "@/lib/utils";
import { AssetUpload } from "./asset-upload";
import type { PublicAsset } from "./types";

type Patch = (fn: (c: WebsiteConfig) => void) => void;

const LANGUAGES = [
  ["en", "English"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
  ["it", "Italian"],
  ["pt", "Portuguese"],
  ["nl", "Dutch"],
  ["sv", "Swedish"],
  ["pl", "Polish"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["zh", "Chinese"],
];
const INTENSITY = ["auto", "subtle", "balanced", "dramatic"] as const;

function Field({ label, children, hint, htmlFor }: { label: string; children: React.ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-normal text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SwitchRow({ label, checked, onChange, disabled, reason }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; reason?: string }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <Label htmlFor={id} className={cn("text-sm font-normal", disabled && "text-muted-foreground")}>
        {label}
        {disabled && reason && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="ml-1 inline-flex align-middle text-muted-foreground" aria-label={reason}><Info className="size-3.5" /></span>
            </TooltipTrigger>
            <TooltipContent className="max-w-60">{reason}</TooltipContent>
          </Tooltip>
        )}
      </Label>
      <Switch id={id} checked={checked && !disabled} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function PickSelect({ id, value, onChange, options }: { id?: string; value: string; onChange: (v: string) => void; options: readonly { id: string; name: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function ConfigPanel({ projectId, config, patch, assets, onAssetUploaded, onAssetDeleted }: { projectId: string; config: WebsiteConfig; patch: Patch; assets: PublicAsset[]; onAssetUploaded: (a: PublicAsset) => void; onAssetDeleted: (id: string) => void }) {
  const ids = { purpose: useId(), placement: useId(), material: useId(), lighting: useId(), framing: useId(), quality: useId(), transition: useId(), fonts: useId(), lang: useId(), format: useId() };
  const s = config.scene;
  const m = config.motion;
  const b = config.brand;
  const o = config.output;
  const uploadedModels = assets.filter((a) => a.kind === "model");
  const uploaded = uploadedModels.find((a) => a.id === s.uploadedModelAssetId) ?? uploadedModels[0];
  const separable = s.subject === "uploaded" ? (uploaded ? Boolean(uploaded.meta.separable) : null) : s.modelId ? Boolean(getModel(s.modelId)?.separable) : null;
  const { notes } = resolveConflicts(config, { modelSeparable: separable });
  const previewPalette = getDirection(config.direction === "auto" ? "cinematic-dark" : config.direction).palette;
  const subjectFilter = s.subject === "auto" || s.subject === "uploaded" ? null : s.subject === "product" ? ["product", "lifestyle"] : [s.subject];
  const models = MODELS.filter((mm) => !subjectFilter || subjectFilter.includes(mm.category));
  const sectionsList: SectionType[] = b.sections;

  const explodedReason = !s.enabled ? "Turn on 3D first." : separable === false ? "The selected model is a single surface, so it can't be separated into parts." : undefined;

  return (
    <div className="space-y-3">
      {notes.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs" aria-live="polite">
          {notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
      <Accordion type="multiple" defaultValue={["direction", "scene"]} className="w-full">
        <AccordionItem value="direction">
          <AccordionTrigger>Purpose & visual direction</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <Field label="Website purpose" htmlFor={ids.purpose}>
              <PickSelect id={ids.purpose} value={config.purpose} onChange={(v) => patch((c) => void (c.purpose = v))} options={PURPOSES} />
            </Field>
            <fieldset className="space-y-2">
              <legend className="text-xs text-muted-foreground">Visual direction</legend>
              <RadioGroup value={config.direction} onValueChange={(v) => patch((c) => void (c.direction = v as WebsiteConfig["direction"]))} className="grid grid-cols-2 gap-2">
                <label className={cn("flex h-full cursor-pointer flex-col justify-center gap-1 rounded-lg border p-3 text-sm", config.direction === "auto" ? "border-primary ring-1 ring-primary" : "border-border/70")}>
                  <RadioGroupItem value="auto" className="sr-only" />
                  <span>Auto</span>
                  <span className="text-[11px] text-muted-foreground">Recommended from your brief</span>
                </label>
                {VISUAL_DIRECTIONS.map((d) => (
                  <label key={d.id} className={cn("cursor-pointer space-y-1.5 rounded-lg border p-1.5", config.direction === d.id ? "border-primary ring-1 ring-primary" : "border-border/70 hover:border-border")}>
                    <RadioGroupItem value={d.id} className="sr-only" aria-label={d.name} />
                    <DirectionSwatch direction={d} compact />
                    <span className="block px-1 text-xs">{d.name}</span>
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="scene">
          <AccordionTrigger>3D scene</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <SwitchRow label="Enable interactive 3D" checked={s.enabled} onChange={(v) => patch((c) => void (c.scene.enabled = v))} />
            <p className="text-[11px] leading-snug text-muted-foreground">Real-time WebGL rendering of a 3D object — not a flat image or CSS perspective effect. Visitors without WebGL see a static fallback.</p>
            {s.enabled && (
              <>
                <Field label="3D subject">
                  <PickSelect
                    value={s.subject}
                    onChange={(v) => patch((c) => {
                      c.scene.subject = v as WebsiteConfig["scene"]["subject"];
                      if (v === "uploaded") {
                        c.scene.uploadedModelAssetId = uploaded?.id ?? null;
                        c.scene.modelId = null;
                      } else c.scene.modelId = null;
                    })}
                    options={[
                      { id: "auto", name: "Auto — recommended" },
                      { id: "product", name: "Product" },
                      { id: "abstract", name: "Abstract / procedural" },
                      { id: "architecture", name: "Architecture" },
                      { id: "gaming", name: "Gaming / fantasy" },
                      ...(uploadedModels.length ? [{ id: "uploaded", name: "My uploaded model" }] : []),
                    ]}
                  />
                </Field>
                {s.subject !== "uploaded" && (
                  <fieldset>
                    <legend className="mb-2 text-xs text-muted-foreground">Model</legend>
                    <RadioGroup value={s.modelId ?? "auto"} onValueChange={(v) => patch((c) => void (c.scene.modelId = v === "auto" ? null : v))} className="grid grid-cols-3 gap-2">
                      <label className={cn("grid aspect-square cursor-pointer place-items-center rounded-lg border text-center text-xs", !s.modelId ? "border-primary ring-1 ring-primary" : "border-border/70")}>
                        <RadioGroupItem value="auto" className="sr-only" />
                        Auto
                      </label>
                      {models.map((mm) => (
                        <label key={mm.id} title={`${mm.name}${mm.separable ? "" : " (single surface)"}`} className={cn("relative cursor-pointer overflow-hidden rounded-lg border bg-black/30", s.modelId === mm.id ? "border-primary ring-1 ring-primary" : "border-border/70 hover:border-border")}>
                          <RadioGroupItem value={mm.id} className="sr-only" aria-label={mm.name} />
                          <ModelThumbnail modelId={mm.id} palette={previewPalette} className="aspect-square w-full" />
                          <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-[10px] text-white">{mm.name}</span>
                        </label>
                      ))}
                    </RadioGroup>
                  </fieldset>
                )}
                <AssetUpload projectId={projectId} kind="model" assets={assets} label="Upload GLB / glTF" hint="Up to 25 MB, embedded textures. Exploded view is offered only when the model has separable parts." onUploaded={(a) => { onAssetUploaded(a); patch((c) => { c.scene.subject = "uploaded"; c.scene.uploadedModelAssetId = a.id; c.scene.modelId = null; if (!a.meta.separable) c.scene.explodedView = false; }); }} onDeleted={(id) => { onAssetDeleted(id); patch((c) => { if (c.scene.uploadedModelAssetId === id) { c.scene.uploadedModelAssetId = null; c.scene.subject = "auto"; } }); }} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Placement" htmlFor={ids.placement}>
                    <PickSelect id={ids.placement} value={s.placement} onChange={(v) => patch((c) => void (c.scene.placement = v as WebsiteConfig["scene"]["placement"]))} options={[{ id: "auto", name: "Auto" }, { id: "hero", name: "Hero" }, { id: "background", name: "Background" }, { id: "product-showcase", name: "Product showcase" }, { id: "dedicated-section", name: "Dedicated section" }]} />
                  </Field>
                  <Field label="Material" htmlFor={ids.material}>
                    <PickSelect id={ids.material} value={s.material} onChange={(v) => patch((c) => void (c.scene.material = v))} options={MATERIAL_PRESETS} />
                  </Field>
                  <Field label="Lighting" htmlFor={ids.lighting}>
                    <PickSelect id={ids.lighting} value={s.lighting} onChange={(v) => patch((c) => void (c.scene.lighting = v))} options={LIGHTING_PRESETS} />
                  </Field>
                  <Field label="Camera framing" htmlFor={ids.framing}>
                    <PickSelect id={ids.framing} value={s.framing} onChange={(v) => patch((c) => void (c.scene.framing = v))} options={CAMERA_FRAMINGS} />
                  </Field>
                </div>
                <div className="divide-y divide-border/50">
                  <SwitchRow label="Auto-rotation" checked={s.autoRotate} onChange={(v) => patch((c) => void (c.scene.autoRotate = v))} />
                  <SwitchRow label="Pointer interaction" checked={s.pointerInteraction} onChange={(v) => patch((c) => void (c.scene.pointerInteraction = v))} />
                  <SwitchRow label="Scroll-controlled camera" checked={s.scrollCamera} onChange={(v) => patch((c) => { c.scene.scrollCamera = v; c.motion.scrollCamera = v; })} />
                  <SwitchRow label="Exploded view" checked={s.explodedView} onChange={(v) => patch((c) => void (c.scene.explodedView = v))} disabled={Boolean(explodedReason)} reason={explodedReason} />
                </div>
                <Field label="Rendering quality" htmlFor={ids.quality}>
                  <PickSelect id={ids.quality} value={s.quality} onChange={(v) => patch((c) => void (c.scene.quality = v as WebsiteConfig["scene"]["quality"]))} options={[{ id: "auto", name: "Auto — recommended" }, { id: "low", name: "Low" }, { id: "medium", name: "Medium" }, { id: "high", name: "High" }]} />
                </Field>
                <fieldset className="space-y-2">
                  <legend className="text-xs text-muted-foreground">On phones</legend>
                  <RadioGroup value={s.mobile} onValueChange={(v) => patch((c) => void (c.scene.mobile = v as WebsiteConfig["scene"]["mobile"]))} className="gap-1.5">
                    {[["simplified", "Simplified 3D", "Lower resolution, fewer effects"], ["static-fallback", "Static fallback", "No WebGL on phones"], ["disabled", "Hide 3D", "Content only"]].map(([v, l, h]) => (
                      <label key={v} className="flex cursor-pointer items-center gap-2 text-sm">
                        <RadioGroupItem value={v} />
                        <span>{l}</span>
                        <span className="text-[11px] text-muted-foreground">— {h}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </fieldset>
              </>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="motion">
          <AccordionTrigger>Scroll & motion</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-normal text-muted-foreground" id="intensity-label">Animation intensity</Label>
                <span className="text-xs capitalize">{m.intensity === "auto" ? "Auto — recommended" : m.intensity}</span>
              </div>
              <Slider aria-labelledby="intensity-label" min={0} max={3} step={1} value={[INTENSITY.indexOf(m.intensity)]} onValueChange={([v]) => patch((c) => void (c.motion.intensity = INTENSITY[v]))} />
              <div className="flex justify-between text-[10px] text-muted-foreground"><span>Auto</span><span>Subtle</span><span>Balanced</span><span>Dramatic</span></div>
            </div>
            <div className="divide-y divide-border/50">
              <SwitchRow label="Smooth scrolling" checked={m.smoothScroll} onChange={(v) => patch((c) => void (c.motion.smoothScroll = v))} />
              <SwitchRow label="Pinned storytelling" checked={m.pinnedSections} onChange={(v) => patch((c) => void (c.motion.pinnedSections = v))} />
              <SwitchRow label="Scroll-driven camera" checked={m.scrollCamera} onChange={(v) => patch((c) => { c.motion.scrollCamera = v; c.scene.scrollCamera = v; })} disabled={!s.enabled} reason="Needs 3D enabled." />
              <SwitchRow label="Parallax" checked={m.parallax} onChange={(v) => patch((c) => void (c.motion.parallax = v))} />
              <SwitchRow label="Horizontal scrolling sections" checked={m.horizontalSections} onChange={(v) => patch((c) => void (c.motion.horizontalSections = v))} />
              <SwitchRow label="Text reveals" checked={m.textReveals} onChange={(v) => patch((c) => void (c.motion.textReveals = v))} />
              <SwitchRow label="Staggered entrances" checked={m.staggeredEntrances} onChange={(v) => patch((c) => void (c.motion.staggeredEntrances = v))} />
              <SwitchRow label="Image transitions" checked={m.imageTransitions} onChange={(v) => patch((c) => void (c.motion.imageTransitions = v))} />
              <SwitchRow label="Particle effects" checked={m.particles} onChange={(v) => patch((c) => void (c.motion.particles = v))} disabled={!s.enabled} reason="Particles render in the 3D scene." />
              <SwitchRow label="Hover interactions" checked={m.hoverInteractions} onChange={(v) => patch((c) => void (c.motion.hoverInteractions = v))} />
              <SwitchRow label="Custom cursor (desktop only)" checked={m.customCursor} onChange={(v) => patch((c) => void (c.motion.customCursor = v))} />
            </div>
            <Field label="Section transitions" htmlFor={ids.transition}>
              <PickSelect id={ids.transition} value={m.sectionTransition} onChange={(v) => patch((c) => void (c.motion.sectionTransition = v as WebsiteConfig["motion"]["sectionTransition"]))} options={[{ id: "auto", name: "Auto" }, { id: "fade", name: "Fade" }, { id: "slide-up", name: "Slide up" }, { id: "clip-reveal", name: "Clip reveal" }, { id: "none", name: "None" }]} />
            </Field>
            <p className="text-[11px] text-muted-foreground">Visitors who prefer reduced motion always get a calm, static version. Phones get lighter effects automatically.</p>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="brand">
          <AccordionTrigger>Brand & content</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <Field label="Brand name"><Input value={b.brandName} maxLength={80} onChange={(e) => patch((c) => void (c.brand.brandName = e.target.value))} /></Field>
            <Field label="Short business description"><Textarea rows={3} maxLength={600} value={b.description} onChange={(e) => patch((c) => void (c.brand.description = e.target.value))} placeholder="What you do, in a sentence or two" /></Field>
            <Field label="Target audience"><Input value={b.audience} maxLength={300} onChange={(e) => patch((c) => void (c.brand.audience = e.target.value))} placeholder="e.g. design-minded homeowners" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Main call to action"><Input value={b.primaryCta} maxLength={60} onChange={(e) => patch((c) => void (c.brand.primaryCta = e.target.value))} placeholder="Get started" /></Field>
              <Field label="CTA link" hint="https:// or mailto:"><Input value={b.primaryCtaUrl} maxLength={500} onChange={(e) => patch((c) => void (c.brand.primaryCtaUrl = e.target.value))} placeholder="https://" /></Field>
            </div>
            <AssetUpload projectId={projectId} kind="logo" assets={assets} label="Logo" hint="PNG, JPEG or WebP." onUploaded={(a) => { onAssetUploaded(a); patch((c) => void (c.brand.logoAssetId = a.id)); }} onDeleted={(id) => { onAssetDeleted(id); patch((c) => { if (c.brand.logoAssetId === id) c.brand.logoAssetId = null; }); }} />
            <fieldset className="space-y-2">
              <legend className="text-xs text-muted-foreground">Brand colors</legend>
              <RadioGroup value={b.colors.mode} onValueChange={(v) => patch((c) => void (c.brand.colors.mode = v as "auto" | "custom"))} className="flex gap-4">
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="auto" /> Auto</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="custom" /> Custom</label>
              </RadioGroup>
              {b.colors.mode === "custom" && (
                <div className="grid grid-cols-3 gap-2">
                  {(["primary", "secondary", "background"] as const).map((k) => (
                    <label key={k} className="space-y-1 text-[11px] capitalize text-muted-foreground">
                      {k === "primary" ? "Accent" : k === "secondary" ? "Second accent" : "Background"}
                      <span className="flex items-center gap-1.5 rounded-md border border-border/70 p-1">
                        <input type="color" value={b.colors[k]} onChange={(e) => patch((c) => void (c.brand.colors[k] = e.target.value.toUpperCase()))} className="size-6 cursor-pointer rounded border-0 bg-transparent" aria-label={`${k} color`} />
                        <span className="font-mono text-[11px] text-foreground">{b.colors[k]}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Typography" htmlFor={ids.fonts}>
                <PickSelect id={ids.fonts} value={b.fontPairing} onChange={(v) => patch((c) => void (c.brand.fontPairing = v))} options={FONT_PAIRINGS.map((f) => ({ id: f.id, name: f.name }))} />
              </Field>
              <Field label="Language" htmlFor={ids.lang}>
                <PickSelect id={ids.lang} value={b.language} onChange={(v) => patch((c) => void (c.brand.language = v))} options={LANGUAGES.map(([id, name]) => ({ id, name }))} />
              </Field>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-xs text-muted-foreground">Sections</legend>
              <RadioGroup value={b.sectionsMode} onValueChange={(v) => patch((c) => { c.brand.sectionsMode = v as "auto" | "custom"; if (v === "custom" && !c.brand.sections.length) c.brand.sections = ["hero", "features", "cta"]; })} className="flex gap-4">
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="auto" /> Auto — recommended</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="custom" /> Choose</label>
              </RadioGroup>
              {b.sectionsMode === "custom" && (
                <div className="space-y-2">
                  <ol className="space-y-1">
                    {sectionsList.map((t, i) => (
                      <li key={`${t}-${i}`} className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-sm">
                        <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
                        <span className="flex-1">{sectionName(t)}</span>
                        <button type="button" className="rounded p-1 hover:bg-muted disabled:opacity-30" disabled={i === 0} aria-label={`Move ${sectionName(t)} up`} onClick={() => patch((c) => { const a = c.brand.sections; [a[i - 1], a[i]] = [a[i], a[i - 1]]; })}><ArrowUp className="size-3.5" /></button>
                        <button type="button" className="rounded p-1 hover:bg-muted disabled:opacity-30" disabled={i === sectionsList.length - 1} aria-label={`Move ${sectionName(t)} down`} onClick={() => patch((c) => { const a = c.brand.sections; [a[i + 1], a[i]] = [a[i], a[i + 1]]; })}><ArrowDown className="size-3.5" /></button>
                        <button type="button" className="rounded px-1.5 text-xs text-muted-foreground hover:text-foreground" aria-label={`Remove ${sectionName(t)}`} onClick={() => patch((c) => void c.brand.sections.splice(i, 1))}>✕</button>
                      </li>
                    ))}
                  </ol>
                  <Select value="" onValueChange={(v) => patch((c) => void c.brand.sections.push(v as SectionType))}>
                    <SelectTrigger className="w-full" aria-label="Add a section"><SelectValue placeholder="Add a section…" /></SelectTrigger>
                    <SelectContent>
                      {SECTION_TYPES.filter((t) => !sectionsList.includes(t.id) && !("requiresFilm" in t) && (!("requires3d" in t) || s.enabled)).map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </fieldset>
            <AssetUpload projectId={projectId} kind="image" multiple assets={assets} label="Images" hint="Used in galleries, case studies and the hero. Up to 8 MB each." onUploaded={(a) => { onAssetUploaded(a); patch((c) => void c.brand.imageAssetIds.push(a.id)); }} onDeleted={(id) => { onAssetDeleted(id); patch((c) => void (c.brand.imageAssetIds = c.brand.imageAssetIds.filter((x) => x !== id))); }} />
            <AssetUpload projectId={projectId} kind="reference" assets={assets} label="Reference screenshot (optional)" hint="Guides mood, layout rhythm and color temperature only. Logos, text and other brands' identity are never copied." onUploaded={(a) => { onAssetUploaded(a); patch((c) => void (c.brand.referenceAssetId = a.id)); }} onDeleted={(id) => { onAssetDeleted(id); patch((c) => { if (c.brand.referenceAssetId === id) c.brand.referenceAssetId = null; }); }} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="output">
          <AccordionTrigger>Output & SEO</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-xs text-muted-foreground">Default download format</legend>
              <RadioGroup value={o.format} onValueChange={(v) => patch((c) => void (c.output.format = v as "zip" | "single-html"))} className="gap-2">
                <label className="flex cursor-pointer gap-2 rounded-lg border border-border/60 p-2.5 text-sm">
                  <RadioGroupItem value="zip" className="mt-0.5" />
                  <span><span className="block">ZIP package</span><span className="text-[11px] text-muted-foreground">HTML, assets, 3D runtime and README. Runs offline; fonts load from Google Fonts when online.</span></span>
                </label>
                <label className="flex cursor-pointer gap-2 rounded-lg border border-border/60 p-2.5 text-sm">
                  <RadioGroupItem value="single-html" className="mt-0.5" />
                  <span><span className="block">Single HTML file</span><span className="text-[11px] text-muted-foreground">Everything inlined (larger file). Runs offline except fonts. Not possible when assets exceed 12 MB.</span></span>
                </label>
              </RadioGroup>
            </fieldset>
            <Field label="SEO title" hint={`${o.seoTitle.length}/70 · leave empty for automatic`}><Input value={o.seoTitle} maxLength={70} onChange={(e) => patch((c) => void (c.output.seoTitle = e.target.value))} /></Field>
            <Field label="SEO description" hint={`${o.seoDescription.length}/170`}><Textarea rows={2} value={o.seoDescription} maxLength={170} onChange={(e) => patch((c) => void (c.output.seoDescription = e.target.value))} /></Field>
            <AssetUpload projectId={projectId} kind="favicon" assets={assets} label="Favicon" hint="Square PNG or ICO. Without one, a favicon is generated from your brand." onUploaded={(a) => { onAssetUploaded(a); patch((c) => void (c.output.faviconAssetId = a.id)); }} onDeleted={(id) => { onAssetDeleted(id); patch((c) => { if (c.output.faviconAssetId === id) c.output.faviconAssetId = null; }); }} />
            <AssetUpload projectId={projectId} kind="social" assets={assets} label="Social sharing image" hint="1200×630 recommended." onUploaded={(a) => { onAssetUploaded(a); patch((c) => void (c.output.socialImageAssetId = a.id)); }} onDeleted={(id) => { onAssetDeleted(id); patch((c) => { if (c.output.socialImageAssetId === id) c.output.socialImageAssetId = null; }); }} />
            <Field label="Contact email" hint="Used by the contact section as an email link."><Input type="email" value={o.contactEmail} maxLength={200} onChange={(e) => patch((c) => void (c.output.contactEmail = e.target.value))} /></Field>
            <Field label="Form endpoint (optional)" hint="An https URL that accepts form posts (e.g. a form service or your API). Without it, no form is generated — a static site can't send messages on its own.">
              <Input value={o.formEndpoint} maxLength={500} onChange={(e) => patch((c) => void (c.output.formEndpoint = e.target.value))} placeholder="https://" />
            </Field>
            <div className="divide-y divide-border/50">
              <SwitchRow label="Prioritize accessibility" checked={o.prioritizeAccessibility} onChange={(v) => patch((c) => void (c.output.prioritizeAccessibility = v))} />
              <SwitchRow label="Prioritize performance" checked={o.prioritizePerformance} onChange={(v) => patch((c) => void (c.output.prioritizePerformance = v))} />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
