/**
 * Payables ledger — "What Doug is owed." First-class rows (replacing the
 * HH-01 seam columns): each permit creates one, marking paid records how
 * (Venmo/Zelle/…), and a mistaken payment can be undone within 5 minutes.
 */
import { prisma } from "@/lib/db";
import type { Payable, Prisma } from "@prisma/client";

export const UNDO_WINDOW_MS = 5 * 60 * 1000;

export type PayableWithJob = Prisma.PayableGetPayload<{
  include: { job: { include: { client: true } } };
}>;

export async function listPayables(): Promise<PayableWithJob[]> {
  return prisma.payable.findMany({
    include: { job: { include: { client: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function payableTotals(): Promise<{ owed: number; paid: number }> {
  const all = await prisma.payable.findMany();
  const sum = (rows: typeof all) => Math.round(rows.reduce((s, p) => s + Number(p.amount), 0) * 100) / 100;
  return {
    owed: sum(all.filter((p) => p.status === "OWED")),
    paid: sum(all.filter((p) => p.status === "PAID")),
  };
}

export async function markPayablePaid(payableId: number, paidVia: string): Promise<Payable> {
  const payable = await prisma.payable.findUniqueOrThrow({ where: { id: payableId } });
  if (payable.status === "PAID") return payable;
  return prisma.payable.update({
    where: { id: payableId },
    data: { status: "PAID", paidAt: new Date(), paidVia: paidVia.trim() || "Other" },
  });
}

/** Undo a mark-paid within the 5-minute window (fat-finger protection). */
export async function undoPayablePaid(payableId: number): Promise<Payable> {
  const payable = await prisma.payable.findUniqueOrThrow({ where: { id: payableId } });
  if (payable.status !== "PAID" || !payable.paidAt) return payable;
  if (Date.now() - payable.paidAt.getTime() > UNDO_WINDOW_MS) {
    throw new Error("The undo window (5 minutes) has passed.");
  }
  return prisma.payable.update({
    where: { id: payableId },
    data: { status: "OWED", paidAt: null, paidVia: null },
  });
}

export function payablesCsv(rows: PayableWithJob[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["Job #", "Client", "Address", "Date", "Payee", "Amount", "Status", "Paid at", "Paid via"];
  const lines = rows.map((p) =>
    [
      `#${p.jobId}`,
      p.job.client.name,
      p.job.address,
      p.createdAt.toISOString().slice(0, 10),
      p.payeeName,
      Number(p.amount).toFixed(2),
      p.status,
      p.paidAt ? p.paidAt.toISOString().slice(0, 10) : "",
      p.paidVia ?? "",
    ].map(esc).join(","),
  );
  return [header.map(esc).join(","), ...lines].join("\n");
}
