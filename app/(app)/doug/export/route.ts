import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listPayables, payablesCsv } from "@/lib/services/payables";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const rows = await listPayables();
  return new NextResponse(payablesCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="doug-ledger.csv"`,
    },
  });
}
