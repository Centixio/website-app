import { z } from "zod";
import { body, json, requireUuid, withSession } from "@/lib/api/http";
import { estimateEdit, estimateGeneration, diffConfig } from "@/lib/credits/estimate";

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate") }),
  z.object({ action: z.literal("edit"), message: z.string().max(4000) }),
  z.object({ action: z.literal("apply-config") }),
]);

export const POST = withSession<{ projectId: string }>(async ({ req, session, params }) => {
  const id = requireUuid(params.projectId, "project");
  const input = await body(req, Schema);
  const credits = await session.store.credits();
  if (input.action === "edit") return json({ estimate: estimateEdit(input.message), credits });
  const rec = await session.store.getConfig(id);
  if (input.action === "generate") return json({ estimate: estimateGeneration(rec.config), credits });
  const diff = diffConfig(rec.appliedConfig, rec.config);
  return json({ estimate: diff.estimate, diff, credits });
});
