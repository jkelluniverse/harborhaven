import { NextResponse } from "next/server";

// Deploy healthcheck. Deliberately DB-free: the app is "up" once Next serves
// requests; migrations run in the pre-deploy step before this is ever hit.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true });
}
