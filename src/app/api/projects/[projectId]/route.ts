import { z } from "zod";
import { body, json, requireUuid, withSession } from "@/lib/api/http";

type P = { projectId: string };

export const GET = withSession<P>(async ({ session, params }) => {
  const project = await session.store.getProject(requireUuid(params.projectId, "project"));
  return project ? json({ project }) : json({ error: { code: "not_found", message: "Project not found." } }, 404);
});

export const PATCH = withSession<P>(async ({ req, session, params }) => {
  const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(80) }));
  await session.store.renameProject(requireUuid(params.projectId, "project"), name);
  return json({ ok: true });
});

export const DELETE = withSession<P>(async ({ session, params }) => {
  await session.store.deleteProject(requireUuid(params.projectId, "project"));
  return json({ ok: true });
});
