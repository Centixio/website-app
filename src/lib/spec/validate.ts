import type { DesignSpec } from "./schema";
import { contrastRatio } from "@/lib/assembler/html";
import { getModel } from "@/lib/catalog/models";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const ALLOWED_SCRIPT_SRC = /^(vendor\/(gsap\/(gsap|ScrollTrigger|ScrollSmoother)\.min\.js|centixio-runtime\.min\.js))$/;
const FABRICATION = /\b(\d{1,3}(,\d{3})+|\d+(\.\d+)?\s?(k|m|million|thousand))\+?\s+(customers|users|clients|downloads|brands|companies|teams)\b|\btrusted by\b|\b\d(\.\d)?\/5\b|★{3,}|\b(award[- ]winning|#1|number one)\b/i;

/**
 * Static validation of a spec and its assembled HTML (export-zip mode).
 * The generated JavaScript is never executed on the server; runtime errors
 * are detected in the sandboxed preview and reported back.
 */
export function validateOutput(spec: DesignSpec, html: string, knownAssetIds: Set<string>, brief = ""): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Document structure
  const h1 = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1 !== 1) errors.push(`The page must have exactly one <h1> (found ${h1}).`);
  if (!/<main id="main">/.test(html)) errors.push("Missing <main> landmark.");
  if (!/<html lang="[a-z]{2}/.test(html)) errors.push("Missing lang attribute.");
  if (!/<title>[^<]{3,}<\/title>/.test(html)) errors.push("Missing or empty <title>.");
  if (!/<meta name="description" content="[^"]{10,}"/.test(html)) warnings.push("Meta description is very short.");

  // Scripts: only our vendored files and our own inline bootstrap/config.
  for (const m of html.matchAll(/<script\b([^>]*)>/g)) {
    const src = m[1].match(/\bsrc="([^"]+)"/)?.[1];
    if (src && !ALLOWED_SCRIPT_SRC.test(src)) errors.push(`Unexpected script source: ${src}`);
  }
  if (/javascript:/i.test(html.replace(/<script[\s\S]*?<\/script>/g, ""))) errors.push("javascript: URLs are not allowed.");
  if (/\son[a-z]+="/i.test(html)) errors.push("Inline event handlers are not allowed.");

  // Links and anchors
  const ids = new Set(Array.from(html.matchAll(/\sid="([^"]+)"/g)).map((m) => m[1]));
  for (const m of html.matchAll(/href="#([^"]*)"/g)) {
    if (m[1] && !ids.has(m[1])) errors.push(`Link points to a missing section: #${m[1]}`);
  }
  const dupIds = spec.sections.map((s) => s.id).filter((id, i, a) => a.indexOf(id) !== i);
  if (dupIds.length) errors.push(`Duplicate section ids: ${dupIds.join(", ")}`);

  // Forms must post somewhere real.
  for (const m of html.matchAll(/<form\b([^>]*)>/g)) {
    if (!/action="https:\/\//.test(m[1])) errors.push("A form has no https endpoint; it would silently do nothing.");
  }

  // Assets: only the project's own uploads.
  const referenced = new Set<string>();
  const collect = (id?: string | null) => id && referenced.add(id);
  collect(spec.brand.logoAssetId);
  collect(spec.assets.faviconAssetId);
  collect(spec.assets.socialImageAssetId);
  if (spec.scene.source.type === "upload") collect(spec.scene.source.assetId);
  for (const s of spec.sections) {
    s.imageAssetIds?.forEach(collect);
    s.items?.forEach((i) => collect(i.imageAssetId));
  }
  for (const id of referenced) if (!knownAssetIds.has(id)) errors.push(`Unknown asset referenced: ${id}`);
  // Remote resources (not links): only Google Fonts is allowed.
  for (const m of html.matchAll(/\ssrc="(https?:\/\/[^"]+)"/g)) errors.push(`Unexpected remote resource: ${m[1]}`);
  for (const m of html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)) {
    if (!/^https:\/\/fonts\.googleapis\.com\//.test(m[1])) errors.push(`Unexpected stylesheet: ${m[1]}`);
  }

  // Readability
  if (contrastRatio(spec.palette.text, spec.palette.background) < 4.5) errors.push("Body text contrast is below WCAG AA (4.5:1).");
  if (contrastRatio(spec.palette.muted, spec.palette.background) < 3) warnings.push("Secondary text contrast is low.");

  // 3D consistency
  if (spec.scene.enabled) {
    if (!/data-cx-stage=/.test(html)) errors.push("3D is enabled but no 3D stage was rendered.");
    if (spec.scene.source.type === "catalog" && !getModel(spec.scene.source.modelId)) errors.push(`Unknown 3D model ${spec.scene.source.modelId}.`);
    if (spec.scene.exploded) {
      const separable = spec.scene.source.type === "upload" ? spec.scene.source.separable : Boolean(getModel(spec.scene.source.modelId)?.separable);
      if (!separable) errors.push("Exploded view requested for a model without separable parts.");
    }
  }

  // Honesty: flag likely fabricated social proof in generated copy.
  const copy = spec.sections.flatMap((s) => [s.heading, s.body ?? "", ...(s.items ?? []).flatMap((i) => [i.title, i.body ?? "", i.meta ?? ""])]).join(" \n ");
  const claim = copy.match(FABRICATION)?.[0];
  if (claim && !brief.toLowerCase().includes(claim.toLowerCase())) errors.push("Copy appears to contain unverified social proof or statistics. Remove numbers, ratings or customer claims that were not in the brief, or use bracketed placeholders.");

  if (html.length > 1_500_000) errors.push("Generated HTML is unexpectedly large.");
  return { ok: errors.length === 0, errors, warnings };
}
