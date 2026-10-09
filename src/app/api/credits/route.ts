import { json, withSession } from "@/lib/api/http";

export const GET = withSession(async ({ session }) => {
  const [credits, ledger, subscription] = await Promise.all([session.store.credits(), session.store.ledger(50), session.store.subscription()]);
  return json({ credits, ledger, subscription, mode: session.user.mode });
});
