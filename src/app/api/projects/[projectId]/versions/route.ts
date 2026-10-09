import { json, requireUuid, withSession } from "@/lib/api/http";

export const GET = withSession<{ projectId: string }>(async ({ session, params }) => json({ versions: await session.store.listVersions(requireUuid(params.projectId, "project")) }));
