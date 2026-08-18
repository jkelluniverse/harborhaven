import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Deploy healthcheck + temporary build introspection while we debug the
// production redirect loop: reports the compiled route tree and middleware
// matchers straight from .next so we can see what the BUILDER produced,
// not what the repo says. Structure only — no secrets, no data.
export const dynamic = "force-dynamic";

function safe<T>(fn: () => T): T | string {
  try {
    return fn();
  } catch (e) {
    return `err:${e instanceof Error ? e.message.slice(0, 80) : "?"}`;
  }
}

export function GET() {
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA ?? null;
  const nextDir = path.join(process.cwd(), ".next");
  const appDir = path.join(nextDir, "server", "app");

  const middlewareMatchers = safe(() => {
    const m = JSON.parse(
      fs.readFileSync(path.join(nextDir, "server", "middleware-manifest.json"), "utf8"),
    ) as { middleware?: Record<string, { matchers?: { regexp?: string; originalSource?: string }[] }> };
    return Object.values(m.middleware ?? {}).flatMap((mw) =>
      (mw.matchers ?? []).map((x) => x.originalSource ?? x.regexp ?? "?"),
    );
  });

  return NextResponse.json({
    ok: true,
    build: "hh03-r3-debug",
    commit: sha,
    source: sha ? "github" : "cli-or-unknown",
    nodeEnv: process.env.NODE_ENV ?? null,
    hasAuthSecret: Boolean(process.env.AUTH_SECRET),
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    cwd: process.cwd(),
    buildId: safe(() => fs.readFileSync(path.join(nextDir, "BUILD_ID"), "utf8").trim()),
    appRoutesTopLevel: safe(() => fs.readdirSync(appDir).sort()),
    hasStaticHome: safe(() => fs.existsSync(path.join(appDir, "index.html"))),
    hasStaticLogin: safe(() => fs.existsSync(path.join(appDir, "login.html"))),
    middlewareMatchers,
  });
}
