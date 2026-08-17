/**
 * The Money tab: three numbers for a period (this month / this year) — money
 * in, money out (expenses + payables paid), open invoices total — plus CSV
 * exports of every money table.
 */
import { prisma } from "@/lib/db";

export interface PeriodSummary {
  moneyIn: number;
  moneyOut: number;
  openInvoices: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function moneySummary(from: Date): Promise<PeriodSummary> {
  const [payments, expenses, payablesPaid, openInvoices] = await Promise.all([
    prisma.payment.findMany({ where: { receivedAt: { gte: from } } }),
    prisma.expense.findMany({ where: { createdAt: { gte: from } } }),
    prisma.payable.findMany({ where: { status: "PAID", paidAt: { gte: from } } }),
    prisma.invoice.findMany({ where: { status: "UNPAID" }, include: { payments: true } }),
  ]);
  const moneyIn = payments.reduce((s, p) => s + Number(p.amount), 0);
  const moneyOut =
    expenses.reduce((s, e) => s + Number(e.cost), 0) +
    payablesPaid.reduce((s, p) => s + Number(p.amount), 0);
  // Open = every unpaid invoice's remaining balance, regardless of period.
  const open = openInvoices.reduce(
    (s, i) => s + Number(i.totalAmount) - i.payments.reduce((x, p) => x + Number(p.amount), 0),
    0,
  );
  return { moneyIn: round2(moneyIn), moneyOut: round2(moneyOut), openInvoices: round2(open) };
}

type CsvRow = (string | number | null | undefined)[];

function toCsv(header: string[], rows: CsvRow[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [header.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

const d = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : "");

export async function exportCsv(what: string): Promise<{ filename: string; csv: string } | null> {
  switch (what) {
    case "jobs": {
      const rows = await prisma.job.findMany({ include: { client: true }, orderBy: { id: "asc" } });
      return {
        filename: "jobs.csv",
        csv: toCsv(
          ["Job #", "Client", "Name", "Address", "Type", "Status", "Created"],
          rows.map((j) => [`#${j.id}`, j.client.name, j.name, j.address, j.type, j.status, d(j.createdAt)]),
        ),
      };
    }
    case "expenses": {
      const rows = await prisma.expense.findMany({ include: { job: { include: { client: true } } }, orderBy: { id: "asc" } });
      return {
        filename: "expenses.csv",
        csv: toCsv(
          ["Job #", "Client", "Vendor", "Category", "Cost", "Client price", "Billable", "Date"],
          rows.map((e) => [
            `#${e.jobId}`, e.job.client.name, e.vendor, e.category,
            Number(e.cost).toFixed(2), e.clientPrice != null ? Number(e.clientPrice).toFixed(2) : "",
            e.billable ? "yes" : "no", d(e.costDate ?? e.createdAt),
          ]),
        ),
      };
    }
    case "invoices": {
      const rows = await prisma.invoice.findMany({ include: { job: { include: { client: true } }, payments: true }, orderBy: { id: "asc" } });
      return {
        filename: "invoices.csv",
        csv: toCsv(
          ["Invoice #", "Job #", "Client", "Stage", "Amount", "Paid", "Status", "Sent", "Due"],
          rows.map((i) => [
            i.id, `#${i.jobId}`, i.job.client.name, i.stage,
            Number(i.totalAmount).toFixed(2),
            i.payments.reduce((s, p) => s + Number(p.amount), 0).toFixed(2),
            i.status, d(i.sentAt), d(i.dueDate),
          ]),
        ),
      };
    }
    case "payments": {
      const rows = await prisma.payment.findMany({ include: { job: { include: { client: true } } }, orderBy: { id: "asc" } });
      return {
        filename: "payments.csv",
        csv: toCsv(
          ["Payment #", "Job #", "Client", "Invoice #", "Amount", "Fee", "Method", "Note", "Received"],
          rows.map((p) => [
            p.id, `#${p.jobId}`, p.job.client.name, p.invoiceId,
            Number(p.amount).toFixed(2), p.feeAmount != null ? Number(p.feeAmount).toFixed(2) : "",
            p.method, p.note, d(p.receivedAt),
          ]),
        ),
      };
    }
    case "payables": {
      const rows = await prisma.payable.findMany({ include: { job: { include: { client: true } } }, orderBy: { id: "asc" } });
      return {
        filename: "payables.csv",
        csv: toCsv(
          ["Job #", "Client", "Payee", "Amount", "Status", "Paid at", "Paid via"],
          rows.map((p) => [
            `#${p.jobId}`, p.job.client.name, p.payeeName,
            Number(p.amount).toFixed(2), p.status, d(p.paidAt), p.paidVia,
          ]),
        ),
      };
    }
    default:
      return null;
  }
}
