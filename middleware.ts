import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// One app, one domain: everything under /app and /api/app is the owner app
// and requires a session. Everything else — the marketing site, the quote
// form, /login, the public estimate pages (/e/[token]), and the Square
// webhook (HMAC-authenticated, not session) — is public.
//
// NOTE: requires Next >= 16. Next 15.5.x had a router bug where a route
// segment named "app" combined with the project running in a directory
// named /app (Railway's workdir) mounted app/app/layout.tsx around every
// route, session-gating the whole site into a redirect loop.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isOwnerRoute =
    pathname === "/app" || pathname.startsWith("/app/") || pathname.startsWith("/api/app");
  if (!isOwnerRoute) return NextResponse.next();

  const token = req.cookies.get("hh_session")?.value;
  if (token && process.env.AUTH_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
      return NextResponse.next();
    } catch {
      // fall through to redirect
    }
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app/:path*", "/app", "/api/app/:path*"],
};
