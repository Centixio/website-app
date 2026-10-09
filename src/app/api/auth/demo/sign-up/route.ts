import { z } from "zod";
import { cookies } from "next/headers";
import { body, errorResponse, HttpError, json } from "@/lib/api/http";
import { appMode } from "@/lib/env";
import { demoAuth } from "@/lib/data/demo-store";
import { DEMO_COOKIE, DEMO_COOKIE_OPTIONS, signDemoSession } from "@/lib/auth/demo-session";

export async function POST(req: Request) {
  try {
    if (appMode() !== "demo") throw new HttpError(404, "not_found", "Not available.");
    const { email, password } = await body(req, z.object({ email: z.string().email().max(200), password: z.string().min(8).max(200) }));
    const user = await demoAuth.signUp(email, password);
    (await cookies()).set(DEMO_COOKIE, signDemoSession({ userId: user.id, email: user.email }), DEMO_COOKIE_OPTIONS);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
