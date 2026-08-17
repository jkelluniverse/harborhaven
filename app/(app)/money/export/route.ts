import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { exportCsv } from "@/lib/services/money";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const what = new URL(req.url).searchParams.get("what") ?? "";
  const result = await exportCsv(what);
  if (!result) return new NextResponse("Unknown export", { status: 400 });
  return new NextResponse(result.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
    },
  });
}
