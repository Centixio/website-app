import { z } from "zod";
import { body, json, withSession } from "@/lib/api/http";
import { DEFAULT_CONFIG, mergeConfig } from "@/lib/config-schema";
import { LIMITS } from "@/config/limits";
import { extractBrandName } from "@/lib/ai/rules-planner";

export const GET = withSession(async ({ session }) => json({ projects: await session.store.listProjects() }));

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  prompt: z.string().trim().max(LIMITS.prompt.maxChars).default(""),
});

export const POST = withSession(async ({ req, session }) => {
  const input = await body(req, CreateSchema);
  const brandName = input.prompt ? extractBrandName(input.prompt) : null;
  const name = input.name ?? brandName ?? (input.prompt ? input.prompt.split(/\s+/).slice(0, 5).join(" ") : "Untitled project");
  const config = mergeConfig(DEFAULT_CONFIG, { brand: { brandName: brandName ?? "" } });
  const project = await session.store.createProject({ name: name.slice(0, 80), prompt: input.prompt, config });
  return json({ project }, 201);
});
