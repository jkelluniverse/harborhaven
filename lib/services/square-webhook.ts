/**
 * Square webhook application — pure of HTTP so the smoke suite can feed it
 * fixture events directly. The route handler verifies the signature and takes
 * the idempotency lock; this module maps events onto local state:
 *
 *   invoice.payment_made / payment.completed → local Payment (method SQUARE,
 *     idempotent on squarePaymentId), posts to invoice + job, PAID auto-flip.
 *   invoice.updated → sync squareInvoiceStatus.
 *   anything else → logged and acknowledged, never a 500.
 */
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { recordPayment } from "./invoices";
import { getPaymentOrderId } from "@/lib/square";

export interface SquareEvent {
  event_id?: string;
  type?: string;
  data?: {
    object?: {
      payment?: {
        id?: string;
        status?: string;
        order_id?: string;
        amount_money?: { amount?: number; currency?: string };
        processing_fee?: { amount_money?: { amount?: number } }[];
        created_at?: string;
      };
      invoice?: {
        id?: string;
        status?: string;
        public_url?: string;
        payment_requests?: { total_completed_amount_money?: { amount?: number } }[];
      };
    };
  };
}

export type ApplyResult = { note: string };

async function findInvoiceForPayment(payment: {
  id?: string;
  order_id?: string;
}): Promise<{ id: number } | null> {
  if (payment.order_id) {
    const byOrder = await prisma.invoice.findUnique({
      where: { squareOrderId: payment.order_id },
      select: { id: true },
    });
    if (byOrder) return byOrder;
  }
  // Fall back to tracing through Square (payment → order). Skipped when the
  // payload had no order id and Square is unreachable.
  if (payment.id) {
    const orderId = await getPaymentOrderId(payment.id);
    if (orderId) {
      return prisma.invoice.findUnique({ where: { squareOrderId: orderId }, select: { id: true } });
    }
  }
  return null;
}

export async function applySquareEvent(event: SquareEvent): Promise<ApplyResult> {
  const type = event.type ?? "";

  if (type === "payment.completed" || type === "invoice.payment_made") {
    const payment = event.data?.object?.payment;
    const invoiceObj = event.data?.object?.invoice;

    if (payment?.id && payment.status && payment.status !== "COMPLETED") {
      return { note: `ignored (payment status ${payment.status})` };
    }

    // Resolve the local invoice: by Square invoice id, else by order id.
    let localInvoice: { id: number } | null = null;
    if (invoiceObj?.id) {
      localInvoice = await prisma.invoice.findUnique({
        where: { squareInvoiceId: invoiceObj.id },
        select: { id: true },
      });
    }
    if (!localInvoice && payment) {
      localInvoice = await findInvoiceForPayment(payment);
    }
    if (!localInvoice) return { note: "ignored (no matching local invoice)" };

    const amountCents =
      payment?.amount_money?.amount ??
      invoiceObj?.payment_requests?.[0]?.total_completed_amount_money?.amount;
    if (!amountCents || amountCents <= 0) return { note: "ignored (no amount)" };

    const feeCents = (payment?.processing_fee ?? []).reduce(
      (s, f) => s + (f.amount_money?.amount ?? 0),
      0,
    );

    const squarePaymentId = payment?.id ?? (invoiceObj?.id ? `inv-${invoiceObj.id}` : null);
    if (!squarePaymentId) return { note: "ignored (no payment id)" };

    const recorded = await recordPayment({
      invoiceId: localInvoice.id,
      amount: amountCents / 100,
      method: "SQUARE",
      squarePaymentId,
      feeAmount: feeCents > 0 ? feeCents / 100 : null,
      receivedAt: payment?.created_at ? new Date(payment.created_at) : new Date(),
      note: null,
    });
    console.log(`[square] payment posted local=${recorded.id} square=${squarePaymentId}`);
    return { note: `payment posted (local ${recorded.id})` };
  }

  if (type === "invoice.updated" || type === "invoice.published" || type === "invoice.canceled") {
    const invoiceObj = event.data?.object?.invoice;
    if (!invoiceObj?.id) return { note: "ignored (no invoice id)" };
    const local = await prisma.invoice.findUnique({ where: { squareInvoiceId: invoiceObj.id } });
    if (!local) return { note: "ignored (unknown invoice)" };
    await prisma.invoice.update({
      where: { id: local.id },
      data: {
        squareInvoiceStatus: invoiceObj.status ?? local.squareInvoiceStatus,
        ...(invoiceObj.public_url ? { publicUrl: invoiceObj.public_url } : {}),
        ...(invoiceObj.status === "CANCELED" && local.status === "UNPAID"
          ? { status: "CANCELED" as const }
          : {}),
      },
    });
    return { note: `invoice status → ${invoiceObj.status ?? "?"}` };
  }

  console.log(`[square] unhandled event type=${type || "unknown"}`);
  return { note: `ignored (unhandled type ${type || "unknown"})` };
}

/** Idempotency lock + apply. The unique create IS the claim: a duplicate
 *  delivery loses the race and stops. On failure the lock is released so
 *  Square's retry can reprocess. */
export async function ingestSquareEvent(event: SquareEvent): Promise<ApplyResult> {
  const eventId = event.event_id;
  if (!eventId) return { note: "ignored (no event id)" };
  try {
    await prisma.webhookEvent.create({ data: { id: eventId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { note: "duplicate event (already processed)" };
    }
    throw e;
  }
  let result: ApplyResult;
  try {
    result = await applySquareEvent(event);
  } catch (e) {
    await prisma.webhookEvent.delete({ where: { id: eventId } }).catch(() => undefined);
    throw e;
  }
  await prisma.webhookEvent
    .update({ where: { id: eventId }, data: { processedAt: new Date() } })
    .catch(() => undefined);
  return result;
}
