/**
 * Invoices and payments. A job carries several invoices (staged billing);
 * invoices are built from line items, or from a deposit amount (which becomes
 * its own line item and leaves the rest unbilled). Payments post to invoice +
 * job; a fully-paid invoice flips PAID, a job with every non-canceled invoice
 * paid flips PAID, and a new invoice on a PAID job flips it back to ACTIVE.
 */
import { prisma } from "@/lib/db";
import type { Invoice, Payment, PaymentMethod, Prisma } from "@prisma/client";
import { lineItemTotal } from "./line-items";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Sensible stage-label default: first bill = "Deposit" (unless it bills
 *  everything at once), the one that bills the last unbilled item = "Final",
 *  everything between = "Progress N". Free text — callers may override. */
export function defaultStageLabel(args: {
  priorInvoiceCount: number;
  billsEverythingRemaining: boolean;
}): string {
  if (args.billsEverythingRemaining) {
    return args.priorInvoiceCount === 0 ? "Full amount" : "Final";
  }
  if (args.priorInvoiceCount === 0) return "Deposit";
  return `Progress ${args.priorInvoiceCount}`;
}

/** A new invoice on a PAID job reopens it (system history row). */
async function reopenPaidJob(jobId: number): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status !== "PAID") return;
  await prisma.statusHistory.create({
    data: {
      jobId,
      fromStatus: "PAID",
      toStatus: "ACTIVE",
      changedBy: "system",
      note: "New invoice created",
    },
  });
  await prisma.job.update({ where: { id: jobId }, data: { status: "ACTIVE" } });
}

/** Create an invoice from unbilled line items (default: all of them). */
export async function createInvoiceFromLineItems(input: {
  jobId: number;
  lineItemIds?: number[]; // default all unbilled
  stage?: string | null;
  dueDate?: Date | null;
}): Promise<Invoice> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: input.jobId },
    include: { lineItems: true, invoices: true },
  });
  const unbilled = job.lineItems.filter((li) => li.invoiceId == null);
  const chosen = input.lineItemIds?.length
    ? unbilled.filter((li) => input.lineItemIds!.includes(li.id))
    : unbilled;
  if (chosen.length === 0) throw new Error("No unbilled line items to invoice");

  const total = round2(chosen.reduce((s, li) => s + lineItemTotal(li), 0));
  const priorCount = job.invoices.filter((i) => i.status !== "CANCELED").length;
  const stage =
    input.stage?.trim() ||
    defaultStageLabel({
      priorInvoiceCount: priorCount,
      billsEverythingRemaining: chosen.length === unbilled.length,
    });

  const invoice = await prisma.invoice.create({
    data: {
      jobId: input.jobId,
      totalAmount: total,
      stage,
      dueDate: input.dueDate ?? null,
    },
  });
  await prisma.lineItem.updateMany({
    where: { id: { in: chosen.map((li) => li.id) } },
    data: { invoiceId: invoice.id },
  });
  await reopenPaidJob(input.jobId);
  return invoice;
}

/** Deposit/stage mode: bill a plain amount now. Creates one line item
 *  ("Deposit — <job name>") attached to the new invoice; every other line
 *  item stays unbilled. */
export async function createDepositInvoice(input: {
  jobId: number;
  amount: number;
  stage?: string | null;
  dueDate?: Date | null;
}): Promise<Invoice> {
  if (input.amount <= 0) throw new Error("Amount must be positive");
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: input.jobId },
    include: { invoices: true },
  });
  const priorCount = job.invoices.filter((i) => i.status !== "CANCELED").length;
  const stage = input.stage?.trim() || (priorCount === 0 ? "Deposit" : `Progress ${priorCount}`);

  const invoice = await prisma.invoice.create({
    data: {
      jobId: input.jobId,
      totalAmount: round2(input.amount),
      stage,
      dueDate: input.dueDate ?? null,
    },
  });
  await prisma.lineItem.create({
    data: {
      jobId: input.jobId,
      invoiceId: invoice.id,
      description: `${stage} — ${job.name}`,
      qty: 1,
      unitPrice: round2(input.amount),
      kind: "OTHER",
    },
  });
  await reopenPaidJob(input.jobId);
  return invoice;
}

/** Cancel a local invoice: releases its line items back to unbilled (except a
 *  deposit's own synthetic item, which goes with it). Blocked once any
 *  payment has posted. Square-side cancel is the caller's job. */
export async function cancelInvoice(invoiceId: number): Promise<Invoice> {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { payments: true, lineItems: true },
  });
  if (invoice.payments.length > 0) {
    throw new Error("A payment has already been recorded on this invoice — it can't be canceled.");
  }
  if (invoice.status === "CANCELED") return invoice;
  // Synthetic deposit items (created with the invoice, no expense source, and
  // described by its stage) die with it; real line items return to unbilled.
  const depositDesc = invoice.stage ? `${invoice.stage} — ` : null;
  for (const li of invoice.lineItems) {
    if (depositDesc && li.description.startsWith(depositDesc) && !li.sourceExpenseId) {
      await prisma.lineItem.delete({ where: { id: li.id } });
    } else {
      await prisma.lineItem.update({ where: { id: li.id }, data: { invoiceId: null } });
    }
  }
  return prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: "CANCELED", squareInvoiceStatus: invoice.squareInvoiceId ? "CANCELED" : null },
  });
}

export async function recordPayment(input: {
  invoiceId: number;
  amount: number;
  method?: PaymentMethod;
  note?: string | null;
  squarePaymentId?: string | null;
  feeAmount?: number | null;
  receivedAt?: Date;
}): Promise<Payment> {
  if (input.amount <= 0) throw new Error("Payment amount must be positive");

  // Idempotent on the Square payment id — a webhook replay changes nothing.
  if (input.squarePaymentId) {
    const existing = await prisma.payment.findUnique({
      where: { squarePaymentId: input.squarePaymentId },
    });
    if (existing) return existing;
  }

  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: input.invoiceId },
    include: { payments: true },
  });

  const payment = await prisma.payment.create({
    data: {
      invoiceId: invoice.id,
      jobId: invoice.jobId,
      amount: input.amount,
      method: input.method ?? "OTHER",
      note: input.note?.trim() || null,
      squarePaymentId: input.squarePaymentId ?? null,
      feeAmount: input.feeAmount ?? null,
      ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
    },
  });

  const paidSoFar = invoice.payments.reduce((s, p) => s + Number(p.amount), 0) + input.amount;
  if (paidSoFar >= Number(invoice.totalAmount) && invoice.status !== "PAID") {
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "PAID" } });
  }

  // Job flips PAID when every non-canceled invoice is paid.
  const invoices = await prisma.invoice.findMany({
    where: { jobId: invoice.jobId, status: { not: "CANCELED" } },
  });
  if (invoices.length > 0 && invoices.every((i) => i.status === "PAID")) {
    const job = await prisma.job.findUniqueOrThrow({ where: { id: invoice.jobId } });
    if (job.status !== "PAID") {
      await prisma.statusHistory.create({
        data: {
          jobId: job.id,
          fromStatus: job.status,
          toStatus: "PAID",
          changedBy: "system",
          note: "All invoices paid",
        },
      });
      await prisma.job.update({ where: { id: job.id }, data: { status: "PAID" } });
    }
  }

  return payment;
}

export interface JobMoneySummary {
  estimated: number; // Σ all line items
  billed: number; // Σ non-canceled invoice totals
  paid: number; // Σ payments
  outstanding: number; // billed − paid
  expenses: number; // Σ expense costs
  dougCut: number; // Σ payables on the job (all statuses)
  dougPaid: number; // Σ payables already paid out
  net: number; // billed − expenses − dougCut ("Net to Chris")
  inHand: number; // paid − expenses − dougPaid ("In hand so far")
  hasPermit: boolean;
}

export async function getJobMoneySummary(jobId: number): Promise<JobMoneySummary> {
  const [invoices, payments, expenses, lineItems, payables] = await Promise.all([
    prisma.invoice.findMany({ where: { jobId, status: { not: "CANCELED" } } }),
    prisma.payment.findMany({ where: { jobId } }),
    prisma.expense.findMany({ where: { jobId } }),
    prisma.lineItem.findMany({ where: { jobId } }),
    prisma.payable.findMany({ where: { jobId } }),
  ]);
  const billed = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
  const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const expenseTotal = expenses.reduce((s, e) => s + Number(e.cost), 0);
  const estimated = lineItems.reduce((s, li) => s + lineItemTotal(li), 0);
  const dougCut = payables.reduce((s, p) => s + Number(p.amount), 0);
  const dougPaid = payables
    .filter((p) => p.status === "PAID")
    .reduce((s, p) => s + Number(p.amount), 0);
  return {
    estimated: round2(estimated),
    billed: round2(billed),
    paid: round2(paid),
    outstanding: round2(billed - paid),
    expenses: round2(expenseTotal),
    dougCut: round2(dougCut),
    dougPaid: round2(dougPaid),
    net: round2(billed - expenseTotal - dougCut),
    inHand: round2(paid - expenseTotal - dougPaid),
    hasPermit: payables.length > 0,
  };
}

export type InvoiceWithRelations = Prisma.InvoiceGetPayload<{
  include: { job: { include: { client: true } }; payments: true; lineItems: true };
}>;

export async function listInvoices(): Promise<InvoiceWithRelations[]> {
  return prisma.invoice.findMany({
    include: { job: { include: { client: true } }, payments: true, lineItems: true },
    orderBy: { issuedAt: "desc" },
  });
}

export async function getInvoiceDetail(invoiceId: number): Promise<InvoiceWithRelations | null> {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { job: { include: { client: true } }, payments: true, lineItems: true },
  });
}

/** Display pill: Draft (never sent), Sent, Partial, Paid, Canceled. */
export function invoiceDisplayStatus(inv: {
  status: string;
  sentAt: Date | null;
  payments: { amount: unknown }[];
  totalAmount: unknown;
}): "Draft" | "Sent" | "Partial" | "Paid" | "Canceled" {
  if (inv.status === "CANCELED") return "Canceled";
  if (inv.status === "PAID") return "Paid";
  const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
  if (paid > 0 && paid < Number(inv.totalAmount)) return "Partial";
  return inv.sentAt ? "Sent" : "Draft";
}
