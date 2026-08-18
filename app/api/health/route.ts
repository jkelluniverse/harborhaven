import { NextResponse } from "next/server";

// Deploy healthcheck. Deliberately DB-free: the app is "up" once Next serves
// requests; migrations run in the pre-deploy step before this is ever hit.
// Also reports which build is actually running: Railway injects
// RAILWAY_GIT_COMMIT_SHA only when the deploy came from the connected GitHub
// repo — a CLI upload of a local folder reports source: "cli-or-unknown".
export const dynamic = "force-dynamic";

export function GET() {
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA ?? null;
  return NextResponse.json({
    ok: true,
    build: "hh03-r2",
    commit: sha,
    source: sha ? "github" : "cli-or-unknown",
  });
}
