import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { EXAMPLES } from "@/examples";
import type { DesignSpec } from "@/lib/spec/schema";

function imageIds(spec: DesignSpec): Set<string> {
  return new Set(spec.sections.flatMap((s) => [...(s.imageAssetIds ?? []), ...((s.items ?? []).map((i) => i.imageAssetId).filter(Boolean) as string[])]));
}
import { exportSingleFile, exportZip, renderPortable } from "@/lib/pipeline/render";
import { validateOutput } from "@/lib/spec/validate";
import { assembleSite } from "@/lib/assembler";
import { DEFAULT_CONFIG, mergeConfig } from "@/lib/config-schema";
import { createRulesPlan } from "@/lib/ai/rules-planner";
import { normalizePlan } from "@/lib/spec/normalize";

const noAssets = async () => new Uint8Array();

describe("export correctness", () => {
  it.each(EXAMPLES.map((e) => [e.slug, e] as const))("sample %s passes validation", (_slug, e) => {
    const ids = imageIds(e.spec);
    const html = renderPortable(e.spec, Array.from(ids).map((id) => ({ id, name: `${id}.webp` })));
    const r = validateOutput(e.spec, html, ids, e.brief);
    expect(r.errors).toEqual([]);
    expect(html).toContain('<main id="main">');
    expect(html).toMatch(/<meta name="description" content=".{10,}"/);
  });

  it("ZIP contains the site, vendored runtime, films, notices and README — and no secrets", async () => {
    const e = { ...EXAMPLES[1], spec: { ...EXAMPLES[1].spec, sections: EXAMPLES[1].spec.sections.filter((s) => s.type !== "gallery") } };
    const { body, filename } = await exportZip(e.spec, [], noAssets);
    expect(filename).toMatch(/\.zip$/);
    const zip = await JSZip.loadAsync(body);
    const names = Object.keys(zip.files);
    const root = names[0].split("/")[0];
    for (const f of ["index.html", "README.md", "THIRD_PARTY_NOTICES.txt", "vendor/centixio-runtime.min.js", "vendor/gsap/gsap.min.js", "vendor/gsap/ScrollTrigger.min.js", "films/halcyon/film.mp4", "films/halcyon/film-m.mp4", "films/halcyon/film.webp"]) {
      expect(names).toContain(`${root}/${f}`);
    }
    const html = await zip.file(`${root}/index.html`)!.async("string");
    expect(html).toContain('src="vendor/centixio-runtime.min.js"');
    expect(html).toContain('data-src="films/halcyon/film.mp4"');
    expect(html).not.toMatch(/sk_(live|test)_|SUPABASE|service_role|ANTHROPIC|localhost|\/api\//);
    expect(html).not.toContain('"preview":true');
    const readme = await zip.file(`${root}/README.md`)!.async("string");
    expect(readme).toMatch(/Google Fonts/);
    expect(readme).toMatch(/No backend/);
  });

  it("single-file export inlines scripts and needs no external script loads", async () => {
    const e = EXAMPLES.find((x) => x.slug === "lumen")!;
    const { body, notes } = await exportSingleFile(e.spec, [], noAssets);
    const html = new TextDecoder().decode(body);
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).toContain("CentixioRuntime");
    expect(html.match(/<\/script/gi)!.length).toBe(html.match(/<script/gi)!.length);
    expect(notes.join(" ")).toMatch(/offline/i);
  });

  it("never renders a contact form without a real endpoint", () => {
    const prompt = "A portfolio for an architecture studio";
    const withEmail = mergeConfig(DEFAULT_CONFIG, { brand: { sectionsMode: "custom", sections: ["hero", "contact"] }, output: { contactEmail: "a@b.co" } });
    const spec = normalizePlan({ plan: createRulesPlan(prompt, withEmail, []), config: withEmail, assets: [], prompt }).spec;
    const html = assembleSite(spec, { mode: "export-zip", assets: { url: () => null }, modelUrl: null });
    expect(html).not.toContain("<form");
    expect(html).toContain("mailto:a@b.co");
    const withEndpoint = mergeConfig(withEmail, { output: { formEndpoint: "https://forms.example.com/f/123" } });
    const spec2 = normalizePlan({ plan: createRulesPlan(prompt, withEndpoint, []), config: withEndpoint, assets: [], prompt }).spec;
    expect(assembleSite(spec2, { mode: "export-zip", assets: { url: () => null }, modelUrl: null })).toContain('action="https://forms.example.com/f/123"');
  });

  it("inlines a scroll film into a single HTML file when it fits the budget", async () => {
    const { body } = await exportSingleFile(EXAMPLES[0].spec, [], noAssets);
    const html = new TextDecoder().decode(body);
    expect(html).toContain('data-src="data:video/mp4;base64,');
    expect(html).not.toMatch(/(src|data-src)="\/?films\//);
  });

  it("flags fabricated social proof that wasn't in the brief", () => {
    const e = structuredClone(EXAMPLES[2].spec);
    e.sections[1].heading = "Trusted by 10,000 customers";
    const r = validateOutput(e, renderPortable(e, []), new Set(), "a brief with no numbers");
    expect(r.ok).toBe(false);
  });
});
