import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { verifySquareSignature } from "@/lib/square";
import { ingestSquareEvent, type SquareEvent } from "@/lib/services/square-webhook";

// Square webhook. Signature-verified before anything is read from the body;
// idempotent on the event id; unknown events are acknowledged, never 500'd.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  const h = await headers();

  // The signature covers the exact public notification URL Square calls.
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const notificationUrl = `${proto}://${host}/api/square/webhook`;
  const signature = h.get("x-square-hmacsha256-signature");

  if (!verifySquareSignature(raw, signature, notificationUrl)) {
    return new NextResponse("Bad signature", { status: 401 });
  }

  let event: SquareEvent;
  try {
    event = JSON.parse(raw) as SquareEvent;
  } catch {
    return new NextResponse("Bad payload", { status: 400 });
  }

  try {
    const result = await ingestSquareEvent(event);
    return NextResponse.json({ ok: true, note: result.note });
  } catch (err) {
    // Let Square retry: 500 only on genuine processing failure.
    console.error("[square] webhook processing error", err);
    return new NextResponse("Processing error", { status: 500 });
  }
}
