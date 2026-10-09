import { json, requireUuid, withSession } from "@/lib/api/http";

export const POST = withSession<{ projectId: string }>(async ({ session, params }) => {
  const project = await session.store.duplicateProject(requireUuid(params.projectId, "project"));
  return json({ project }, 201);
});
