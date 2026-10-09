import { json, requireUuid, withSession } from "@/lib/api/http";

export const POST = withSession<{ jobId: string }>(async ({ session, params }) => json({ status: await session.store.cancelJob(requireUuid(params.jobId, "job")) }));
