/**
 * Line items — what actually goes on a bill. Free-form items from templates,
 * billable expenses promoted at clientPrice, and the permit pattern: one tap
 * creates a PERMIT line item at the permit price plus a linked Payable to the
 * license holder for their cut.
 */
import { prisma } from "@/lib/db";
import type { LineItem, LineItemKind } from "@prisma/client";
import { getNumberSetting, getSetting } from "./settings";

export async function addLineItem(input: {
  jobId: number;
  description: string;
  qty?: number;
  unitPrice: number;
  kind?: LineItemKind;
}): Promise<LineItem> {
  await prisma.job.findUniqueOrThrow({ where: { id: input.jobId } });
  return prisma.lineItem.create({
    data: {
      jobId: input.jobId,
      description: input.description.trim(),
      qty: input.qty ?? 1,
      unitPrice: input.unitPrice,
      kind: input.kind ?? "OTHER",
    },
  });
}

/** One-tap permit: PERMIT line item at permit_price + linked Payable for
 *  permit_payable to the permit payee. Returns both. */
export async function addPermit(jobId: number): Promise<{ lineItem: LineItem; payableId: number }> {
  await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const [price, cut, payee] = await Promise.all([
    getNumberSetting("permit_price"),
    getNumberSetting("permit_payable"),
    getSetting("permit_payee_name"),
  ]);
  const lineItem = await prisma.lineItem.create({
    data: { jobId, description: "Permit", qty: 1, unitPrice: price, kind: "PERMIT" },
  });
  const payable = await prisma.payable.create({
    data: { jobId, lineItemId: lineItem.id, payeeName: payee, amount: cut },
  });
  return { lineItem, payableId: payable.id };
}

/** Promote a billable expense to a line item at its clientPrice. Idempotent —
 *  an expense can appear on the bill only once (unique sourceExpenseId). */
export async function addExpenseToBill(expenseId: number): Promise<LineItem> {
  const expense = await prisma.expense.findUniqueOrThrow({
    where: { id: expenseId },
    include: { lineItem: true },
  });
  if (expense.lineItem) return expense.lineItem;
  if (!expense.billable) throw new Error("This expense is marked not billable");
  const price = expense.clientPrice ?? expense.cost;
  const label = [expense.vendor, expense.notes].filter(Boolean).join(" — ") || expense.category || "Expense";
  return prisma.lineItem.create({
    data: {
      jobId: expense.jobId,
      description: label,
      qty: 1,
      unitPrice: price,
      kind: expense.category === "subcontractor" ? "LABOR" : "MATERIALS",
      sourceExpenseId: expense.id,
    },
  });
}

/** Remove an unbilled line item. A billed item can't be removed (cancel the
 *  invoice first). Deleting a permit voids its unpaid payable; a PAID payable
 *  blocks deletion with a plain-English message. */
export async function removeLineItem(lineItemId: number): Promise<void> {
  const item = await prisma.lineItem.findUniqueOrThrow({
    where: { id: lineItemId },
    include: { payables: true },
  });
  if (item.invoiceId) {
    throw new Error("This item is already on an invoice. Cancel that invoice first.");
  }
  const paid = item.payables.find((p) => p.status === "PAID");
  if (paid) {
    throw new Error(
      `${paid.payeeName} has already been paid ${Number(paid.amount).toLocaleString("en-US", { style: "currency", currency: "USD" })} for this permit, so it can't be deleted. If this is a mistake, undo the payment on the ${paid.payeeName.split(" ")[0]} screen first.`,
    );
  }
  await prisma.payable.deleteMany({ where: { lineItemId: item.id, status: "OWED" } });
  await prisma.lineItem.delete({ where: { id: item.id } });
}

export function lineItemTotal(item: { qty: unknown; unitPrice: unknown }): number {
  return Math.round(Number(item.qty) * Number(item.unitPrice) * 100) / 100;
}
