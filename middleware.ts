import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// One app, one domain: everything under /app and /api/app is the owner app
// and requires a session. Everything else — the marketing site, the quote
// form, /login, the public estimate pages (/e/[token]), and the Square
// webhook (HMAC-authenticated, not session) — is public.
//
// TEMPORARY (redirect-loop debug): matcher widened to everything and every
// response tagged with x-hh-mw:<pathname-the-app-saw>, so we can see from
// outside what path Railway's edge actually hands us. Public paths still pass
// straight through; owner-route logic is unchanged. Revert the matcher once
// the loop is diagnosed.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isOwnerRoute =
    pathname === "/app" || pathname.startsWith("/app/") || pathname.startsWith("/api/app");

  if (!isOwnerRoute) {
    const res = NextResponse.next();
    res.headers.set("x-hh-mw", `pass:${pathname}`);
    return res;
  }

  const token = req.cookies.get("hh_session")?.value;
  if (token && process.env.AUTH_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
      const res = NextResponse.next();
      res.headers.set("x-hh-mw", `auth:${pathname}`);
      return res;
    } catch {
      // fall through to redirect
    }
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  const res = NextResponse.redirect(url);
  res.headers.set("x-hh-mw", `gate:${pathname}`);
  return res;
}

export const config = {
  matcher: ["/((?!_next/).*)"],
};
