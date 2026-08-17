/**
 * "Send invoice" orchestration: upsert the Square Customer from the Client,
 * create the Square Order from the invoice's line items, create + publish the
 * Square Invoice (Square emails the hosted payment page; ACH free, card with
 * fee), then store the linkage locally. Every mutating Square call carries a
 * deterministic idempotency key, so a retry never double-sends.
 */
import { prisma } from "@/lib/db";
import {
  squareConfigured,
  ensureSquareCustomer,
  createAndPublishInvoice,
  cancelSquareInvoice,
} from "@/lib/square";
import { cancelInvoice } from "./invoices";
import { lineItemTotal } from "./line-items";

export type SendResult = { ok: true; publicUrl: string | null } | { ok: false; error: string };

export async function sendInvoiceViaSquare(invoiceId: number): Promise<SendResult> {
  if (!squareConfigured()) {
    return { ok: false, error: "Square isn't set up yet — add the Square keys to the environment." };
  }
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { job: { include: { client: true } }, lineItems: true },
  });
  if (invoice.status === "CANCELED") return { ok: false, error: "This invoice was canceled." };
  if (invoice.squareInvoiceId) {
    // Already sent — treat as success (idempotent).
    return { ok: true, publicUrl: invoice.publicUrl };
  }
  const client = invoice.job.client;
  if (!client.email) {
    return { ok: false, error: `${client.name} has no email on file — add one on the client screen first.` };
  }
  const squareCustomerId = await ensureSquareCustomer(client.id);
  if (!squareCustomerId) return { ok: false, error: "Couldn't reach Square to set up the customer." };

  const squareItems = invoice.lineItems.length
    ? invoice.lineItems.map((li) => ({
        name: li.description,
        qty: String(Number(li.qty)),
        amountCents: Math.round(Number(li.unitPrice) * 100),
      }))
    : [
        {
          name: `${invoice.stage ?? "Invoice"} — ${invoice.job.name}`,
          qty: "1",
          amountCents: Math.round(Number(invoice.totalAmount) * 100),
        },
      ];

  // Guard against drift between line items and the stored total.
  const itemTotal = invoice.lineItems.reduce((s, li) => s + lineItemTotal(li), 0);
  if (invoice.lineItems.length && Math.abs(itemTotal - Number(invoice.totalAmount)) > 0.01) {
    return { ok: false, error: "Line items don't add up to the invoice total — refresh and try again." };
  }

  const result = await createAndPublishInvoice({
    localInvoiceId: invoice.id,
    squareCustomerId,
    title: `${invoice.job.name}${invoice.stage ? ` — ${invoice.stage}` : ""}`,
    lineItems: squareItems,
    dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : null,
  });
  if (!result.ok) return { ok: false, error: result.error };

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      squareInvoiceId: result.squareInvoiceId,
      squareOrderId: result.squareOrderId,
      squareInvoiceStatus: result.status,
      publicUrl: result.publicUrl,
      sentAt: new Date(),
    },
  });
  return { ok: true, publicUrl: result.publicUrl };
}

/** Cancel: Square-side first (best effort), then local void. Local cancel
 *  throws if a payment has posted. */
export async function cancelInvoiceEverywhere(invoiceId: number): Promise<void> {
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  await cancelInvoice(invoiceId); // throws when payments exist — nothing touched yet
  if (invoice.squareInvoiceId) {
    const ok = await cancelSquareInvoice(invoice.squareInvoiceId);
    if (!ok) console.error(`[square] local invoice ${invoiceId} voided but Square cancel failed — check Square dashboard`);
  }
}
