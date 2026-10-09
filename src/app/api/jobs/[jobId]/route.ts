import { HttpError, json, requireUuid, withSession } from "@/lib/api/http";

/** Progress is read from the persisted job row, so it is truthful and survives page reloads. */
export const GET = withSession<{ jobId: string }>(async ({ session, params }) => {
  const job = await session.store.getJob(requireUuid(params.jobId, "job"));
  if (!job) throw new HttpError(404, "not_found", "Job not found.");
  const { input: _i, ...pub } = job;
  return json({ job: pub });
});
