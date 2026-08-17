/**
 * Invoices and payments. Ported behavior: invoices belong to a job and a job
 * can carry several (staged billing — e.g. $10k now, $10k at completion).
 * New for Harbor Haven: real Payment rows post to invoice + job; an invoice
 * flips to PAID when its payments cover the total, and the job flips to PAID
 * when every invoice is paid. squareInvoiceId / squarePaymentId are HH-02
 * seams and are never set by HH-01 code.
 */
import { prisma } from "@/lib/db";
import type { Invoice, Payment, PaymentMethod } from "@prisma/client";

export async function createInvoice(input: {
  jobId: number;
  totalAmount: number;
  dueDate?: Date | null;
}): Promise<Invoice> {
  if (input.totalAmount < 0) throw new Error("totalAmount must be non-negative");
  await prisma.job.findUniqueOrThrow({ where: { id: input.jobId } });
  return prisma.invoice.create({
    data: {
      jobId: input.jobId,
      totalAmount: input.totalAmount,
      dueDate: input.dueDate ?? null,
    },
  });
}

export async function recordPayment(input: {
  invoiceId: number;
  amount: number;
  method?: PaymentMethod;
  note?: string | null;
  paidAt?: Date;
}): Promise<Payment> {
  if (input.amount <= 0) throw new Error("Payment amount must be positive");
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
      ...(input.paidAt ? { paidAt: input.paidAt } : {}),
    },
  });

  // Flip the invoice to PAID when payments cover the total.
  const paidSoFar = invoice.payments.reduce((s, p) => s + Number(p.amount), 0) + input.amount;
  if (paidSoFar >= Number(invoice.totalAmount) && invoice.status !== "PAID") {
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "PAID" } });
  }

  // Flip the job to PAID when every invoice on it is paid.
  const invoices = await prisma.invoice.findMany({ where: { jobId: invoice.jobId } });
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
  billed: number;
  paid: number;
  outstanding: number;
  expenses: number;
  net: number;
}

/** billed = Σ invoice totals · paid = Σ payments · outstanding = billed − paid
 *  expenses = Σ expense costs · net = paid − expenses */
export async function getJobMoneySummary(jobId: number): Promise<JobMoneySummary> {
  const [invoices, payments, expenses] = await Promise.all([
    prisma.invoice.findMany({ where: { jobId } }),
    prisma.payment.findMany({ where: { jobId } }),
    prisma.expense.findMany({ where: { jobId } }),
  ]);
  const billed = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
  const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const expenseTotal = expenses.reduce((s, e) => s + Number(e.cost), 0);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    billed: round(billed),
    paid: round(paid),
    outstanding: round(billed - paid),
    expenses: round(expenseTotal),
    net: round(paid - expenseTotal),
  };
}

export async function listInvoices() {
  return prisma.invoice.findMany({
    include: { job: { include: { client: true } }, payments: true },
    orderBy: { issuedAt: "desc" },
  });
}
