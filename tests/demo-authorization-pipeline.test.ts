import fs from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { DemoUserStore, DemoWorkerStore, demoAuth } from "@/lib/data/demo-store";
import { StoreError } from "@/lib/data/types";
import { DEFAULT_CONFIG } from "@/lib/config-schema";
import { processJob } from "@/lib/pipeline/process-job";
import { DEMO_STARTING_CREDITS } from "@/config/pricing";

afterAll(() => fs.rmSync(process.env.CENTIXIO_DEMO_DIR!, { recursive: true, force: true }));

describe("authorization (demo store)", () => {
  it("does not treat a project id as authorization", async () => {
    const a = await demoAuth.signUp(`a${Date.now()}@test.dev`, "password-1");
    const b = await demoAuth.signUp(`b${Date.now()}@test.dev`, "password-2");
    const sa = new DemoUserStore(a.id);
    const sb = new DemoUserStore(b.id);
    const p = await sa.createProject({ name: "Secret", prompt: "x", config: DEFAULT_CONFIG });
    expect(await sb.getProject(p.id)).toBeNull();
    expect(await sb.listProjects()).toHaveLength(0);
    await expect(sb.renameProject(p.id, "pwned")).rejects.toBeInstanceOf(StoreError);
    await expect(sb.deleteProject(p.id)).rejects.toBeInstanceOf(StoreError);
    await expect(sb.getConfig(p.id)).rejects.toBeInstanceOf(StoreError);
    await expect(sb.listMessages(p.id)).rejects.toBeInstanceOf(StoreError);
    await expect(sb.enqueueJob({ projectId: p.id, kind: "generate", input: { prompt: "x", config: DEFAULT_CONFIG }, cost: 1, idempotencyKey: "k-1", maxConcurrent: 5, maxPerHour: 50 })).rejects.toBeInstanceOf(StoreError);
    expect((await sb.credits()).total).toBe(DEMO_STARTING_CREDITS);
  });
});

describe("generation pipeline (rules provider, demo store)", () => {
  it("generates, validates, saves a version and settles exactly the reserved credits", async () => {
    const u = await demoAuth.signUp(`p${Date.now()}@test.dev`, "password-3");
    const store = new DemoUserStore(u.id);
    const project = await store.createProject({ name: "Nocturne", prompt: "A luxury perfume called 'Nocturne'", config: DEFAULT_CONFIG });
    const job = await store.enqueueJob({ projectId: project.id, kind: "generate", input: { prompt: project.prompt, config: DEFAULT_CONFIG }, cost: 10, idempotencyKey: "gen-1", maxConcurrent: 2, maxPerHour: 30 });
    expect((await store.credits()).held).toBe(10);
    const worker = new DemoWorkerStore();
    const claimed = await worker.claimJob("w", 60, job.id);
    expect(claimed?.status).toBe("running");
    await processJob(claimed!, worker, "w");
    const done = await store.getJob(job.id);
    expect(done?.status).toBe("completed");
    const versions = await store.listVersions(project.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].creditCharge).toBe(10);
    const v = await store.getVersion(project.id, versions[0].id);
    expect(v?.spec.sections[0].type).toBe("hero");
    expect(v?.html).toContain("data-cx-stage");
    const c = await store.credits();
    expect(c.total).toBe(DEMO_STARTING_CREDITS - 10);
    expect(c.held).toBe(0);
  });

  it("releases credits when the rule-based editor can't interpret an edit", async () => {
    const u = await demoAuth.signUp(`q${Date.now()}@test.dev`, "password-4");
    const store = new DemoUserStore(u.id);
    const worker = new DemoWorkerStore();
    const project = await store.createProject({ name: "Site", prompt: "A SaaS landing page for an analytics tool", config: DEFAULT_CONFIG });
    const gen = await store.enqueueJob({ projectId: project.id, kind: "generate", input: { prompt: project.prompt, config: DEFAULT_CONFIG }, cost: 10, idempotencyKey: "g", maxConcurrent: 2, maxPerHour: 30 });
    await processJob((await worker.claimJob("w", 60, gen.id))!, worker, "w");
    const current = (await store.getProject(project.id))!.currentVersionId;
    const edit = await store.enqueueJob({ projectId: project.id, kind: "edit", input: { prompt: project.prompt, instruction: "Please make it sing like a whale", editScope: "small", config: DEFAULT_CONFIG, baseVersionId: current }, cost: 2, idempotencyKey: "e", maxConcurrent: 2, maxPerHour: 30 });
    await processJob((await worker.claimJob("w", 60, edit.id))!, worker, "w");
    const failed = await store.getJob(edit.id);
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toMatch(/could not interpret/);
    expect((await store.credits()).total).toBe(DEMO_STARTING_CREDITS - 10);

    const edit2 = await store.enqueueJob({ projectId: project.id, kind: "edit", input: { prompt: project.prompt, instruction: "Change the colors to black and gold", editScope: "small", config: DEFAULT_CONFIG, baseVersionId: current }, cost: 2, idempotencyKey: "e2", maxConcurrent: 2, maxPerHour: 30 });
    await processJob((await worker.claimJob("w", 60, edit2.id))!, worker, "w");
    const v2 = await store.getVersion(project.id, (await store.getProject(project.id))!.currentVersionId!);
    expect(v2?.spec.palette.background).toBe("#08080A");
    expect(v2?.spec.palette.accent).toBe("#D4AF37");
    expect((await store.getConfig(project.id)).config.brand.colors.mode).toBe("custom");
  });
});
