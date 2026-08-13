// Gate every request on the demo session cookie (see src/lib/demoAuth.ts).
//
// This runs ahead of the rewrites in next.config.ts, so /live-api and the
// /energy-api proxy are covered too — those reach real services and must never
// be callable by someone who has not signed in.

import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  authConfig,
  deployedWithoutAuth,
  verifySession,
} from "@/lib/demoAuth";

export async function middleware(req: NextRequest) {
  if (deployedWithoutAuth()) {
    return new NextResponse(
      "Demo sign-in is not configured. Set DEMO_AUTH_EMAIL, DEMO_AUTH_PASSWORD and DEMO_AUTH_SECRET.",
      { status: 503, headers: { "content-type": "text/plain" } },
    );
  }

  const cfg = authConfig();
  // No credentials configured and not deployed: local development, no gate.
  if (!cfg) return withNoIndex(NextResponse.next());

  const ok = await verifySession(cfg, req.cookies.get(SESSION_COOKIE)?.value, Date.now());
  if (ok) return withNoIndex(NextResponse.next());

  // An expired or forged cookie is worth clearing, so the next request arrives
  // clean rather than failing verification again.
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  // Where to land after signing in. Only same-site paths, never a full URL, so
  // the parameter can't be used to bounce someone off to another host.
  const from = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (from && from !== "/" && !from.startsWith("//")) url.searchParams.set("from", from);

  const res = withNoIndex(NextResponse.redirect(url));
  if (req.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
  return res;
}

/** The URL is easy to guess; at least keep it out of search results. */
function withNoIndex(res: NextResponse): NextResponse {
  res.headers.set("x-robots-tag", "noindex, nofollow");
  return res;
}

export const config = {
  // Everything except the login screen itself, the endpoint it posts to, and
  // the static assets that screen needs to render.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|ergos.png|login|api/auth/login).*)",
  ],
};
