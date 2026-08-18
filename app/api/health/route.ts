import { NextResponse } from "next/server";

// Deploy healthcheck. Deliberately DB-free: the app is "up" once Next serves
// requests; migrations run in the pre-deploy step before this is ever hit.
// Reports the running commit (Railway injects RAILWAY_GIT_COMMIT_SHA for
// GitHub-connected deploys) so "which build is live?" is answerable from
// the outside.
export const dynamic = "force-dynamic";

export function GET() {
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA ?? null;
  return NextResponse.json({
    ok: true,
    commit: sha,
    source: sha ? "github" : "cli-or-unknown",
  });
}
