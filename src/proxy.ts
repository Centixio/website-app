import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED = ["/dashboard", "/projects", "/billing", "/settings"];

/**
 * Refreshes the Supabase session cookie and performs an optimistic redirect
 * for signed-out visitors. Authorization is enforced again in every route
 * handler and by row-level security; this is only a convenience.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isProtected = PROTECTED.some((p) => request.nextUrl.pathname === p || request.nextUrl.pathname.startsWith(`${p}/`));

  let response = NextResponse.next({ request });
  let signedIn = false;

  const supabaseConfigured = Boolean(url && key && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
  if (supabaseConfigured) {
    const supabase = createServerClient(url!, key!, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    });
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  } else {
    signedIn = Boolean(request.cookies.get("cx_demo_session")?.value);
  }

  if (isProtected && !signedIn) {
    const to = request.nextUrl.clone();
    to.pathname = "/sign-in";
    to.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|brand/|vendor/|examples/|preview-frame|api/billing/webhook|api/cron|api/demo-assets).*)"],
};
