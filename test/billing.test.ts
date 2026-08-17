/**
 * HH-02 smoke additions: permit pattern, Doug ledger, line-item invoicing,
 * deposit mode, webhook fixture → payment posts + PAID flip, PAID→ACTIVE
 * reopen, and the §0 money summary. No Square network calls: fixtures carry
 * the ids the webhook needs, and Square-touching sends are not exercised
 * (the sandbox script covers those manually).
 */
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/services/clients";
import { createJob, getJobDetail } from "@/lib/services/jobs";
import { addExpense } from "@/lib/services/expenses";
import { addPermit, addExpenseToBill, removeLineItem, addLineItem } from "@/lib/services/line-items";
import { markPayablePaid, undoPayablePaid, payableTotals } from "@/lib/services/payables";
import {
  createInvoiceFromLineItems,
  createDepositInvoice,
  getJobMoneySummary,
  invoiceDisplayStatus,
  defaultStageLabel,
} from "@/lib/services/invoices";
import { ingestSquareEvent } from "@/lib/services/square-webhook";

const RUN = `hh02_${Date.now()}`;
const CLIENT_NAME = `Billing Test Client ${RUN}`;

afterAll(async () => {
  const jobs = await prisma.job.findMany({ where: { client: { name: CLIENT_NAME } } });
  const ids = jobs.map((j) => j.id);
  await prisma.payment.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.payable.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.lineItem.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.invoice.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.expense.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.jobNote.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.statusHistory.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.job.deleteMany({ where: { id: { in: ids } } });
  await prisma.client.deleteMany({ where: { name: CLIENT_NAME } });
  await prisma.webhookEvent.deleteMany({ where: { id: { startsWith: RUN } } });
  await prisma.$disconnect();
});

describe("permit pattern + Doug ledger", () => {
  let jobId: number;
  let payableId: number;
  let permitItemId: number;

  it("permit-only job gets its permit + payable automatically", async () => {
    await createClient({ name: CLIENT_NAME });
    const job = await createJob({
      clientName: CLIENT_NAME,
      name: "Permit test",
      address: "1 Permit Way",
      type: "PERMIT_ONLY",
      createdBy: "test",
    });
    jobId = job.id;
    const detail = await getJobDetail(jobId);
    const permit = detail!.lineItems.find((li) => li.kind === "PERMIT");
    expect(permit).toBeDefined();
    expect(Number(permit!.unitPrice)).toBe(1500);
    permitItemId = permit!.id;
    const payable = detail!.payables[0];
    expect(payable).toBeDefined();
    expect(payable.payeeName).toBe("Doug Prestier");
    expect(Number(payable.amount)).toBe(500);
    expect(payable.lineItemId).toBe(permit!.id);
    expect(payable.status).toBe("OWED");
    payableId = payable.id;
  });

  it("money summary shows Doug's cut per the §0 definition", async () => {
    const m = await getJobMoneySummary(jobId);
    expect(m.hasPermit).toBe(true);
    expect(m.estimated).toBe(1500);
    expect(m.dougCut).toBe(500);
    expect(m.net).toBe(0 - 0 - 500 + 0); // billed 0 − expenses 0 − dougCut 500
    expect(m.inHand).toBe(0);
  });

  it("mark paid → Doug totals move; undo within window restores", async () => {
    const before = await payableTotals();
    await markPayablePaid(payableId, "Venmo");
    const mid = await payableTotals();
    expect(mid.owed).toBeCloseTo(before.owed - 500, 2);
    expect(mid.paid).toBeCloseTo(before.paid + 500, 2);
    const undone = await undoPayablePaid(payableId);
    expect(undone.status).toBe("OWED");
    const after = await payableTotals();
    expect(after.owed).toBeCloseTo(before.owed, 2);
  });

  it("deleting a permit line item voids the unpaid payable", async () => {
    await removeLineItem(permitItemId);
    const remaining = await prisma.payable.findUnique({ where: { id: payableId } });
    expect(remaining).toBeNull();
  });

  it("a PAID payable blocks deleting its permit line item", async () => {
    const { lineItem, payableId: pid } = await addPermit(jobId);
    await markPayablePaid(pid, "Zelle");
    await expect(removeLineItem(lineItem.id)).rejects.toThrow(/already been paid/);
  });
});

describe("line items → invoices → webhook payment", () => {
  let jobId: number;
  let invoiceId: number;
  let squareInvoiceId: string;

  it("builds a bill from line items and a promoted expense", async () => {
    const job = await createJob({
      clientName: CLIENT_NAME,
      name: "Billing flow",
      address: "2 Invoice St",
      type: "PROJECT",
      createdBy: "test",
    });
    jobId = job.id;
    await addLineItem({ jobId, description: "Labor", qty: 2, unitPrice: 250, kind: "LABOR" });
    const expense = await addExpense({ jobId, cost: 100, vendor: "Vendor X" }); // clientPrice 120
    const promoted = await addExpenseToBill(expense.id);
    expect(Number(promoted.unitPrice)).toBeCloseTo(120, 2);
    expect(promoted.sourceExpenseId).toBe(expense.id);
    // Promoting twice is a no-op (idempotent)
    const again = await addExpenseToBill(expense.id);
    expect(again.id).toBe(promoted.id);
  });

  it("deposit-mode invoice leaves the other items unbilled", async () => {
    const invoice = await createDepositInvoice({ jobId, amount: 300 });
    expect(invoice.stage).toBe("Deposit");
    expect(Number(invoice.totalAmount)).toBe(300);
    const detail = await getJobDetail(jobId);
    const unbilled = detail!.lineItems.filter((li) => li.invoiceId == null);
    expect(unbilled.length).toBe(2); // labor + promoted expense untouched
  });

  it("creates the final invoice from all remaining line items", async () => {
    const invoice = await createInvoiceFromLineItems({ jobId });
    invoiceId = invoice.id;
    expect(Number(invoice.totalAmount)).toBeCloseTo(620, 2); // 2×250 + 120
    expect(invoice.stage).toBe("Final");
    const detail = await getJobDetail(jobId);
    expect(detail!.lineItems.every((li) => li.invoiceId != null)).toBe(true);
    expect(invoiceDisplayStatus({ ...invoice, payments: [] })).toBe("Draft");
  });

  it("webhook fixture posts the payment and flips invoice + job", async () => {
    // Pretend the invoice went out through Square.
    squareInvoiceId = `${RUN}-sqinv-1`;
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        squareInvoiceId,
        squareOrderId: `${RUN}-sqord-1`,
        sentAt: new Date(),
        squareInvoiceStatus: "UNPAID",
      },
    });
    // Pay the deposit invoice out-of-band first so the job can flip PAID.
    const deposit = (await prisma.invoice.findMany({ where: { jobId, stage: "Deposit" } }))[0];
    const { recordPayment } = await import("@/lib/services/invoices");
    await recordPayment({ invoiceId: deposit.id, amount: 300, method: "OTHER", note: "check" });

    const fixture = {
      event_id: `${RUN}-evt-1`,
      type: "invoice.payment_made",
      data: {
        object: {
          invoice: { id: squareInvoiceId, status: "PAID" },
          payment: {
            id: `${RUN}-pay-1`,
            status: "COMPLETED",
            order_id: `${RUN}-sqord-1`,
            amount_money: { amount: 62000, currency: "USD" },
            processing_fee: [{ amount_money: { amount: 1798 } }],
            created_at: new Date().toISOString(),
          },
        },
      },
    };
    const result = await ingestSquareEvent(fixture);
    expect(result.note).toMatch(/payment posted/);

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { payments: true },
    });
    expect(invoice.status).toBe("PAID");
    const posted = invoice.payments.find((p) => p.squarePaymentId === `${RUN}-pay-1`)!;
    expect(Number(posted.amount)).toBe(620);
    expect(Number(posted.feeAmount)).toBeCloseTo(17.98, 2);
    expect(posted.method).toBe("SQUARE");

    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe("PAID");
  });

  it("replaying the same webhook event changes nothing", async () => {
    const fixture = {
      event_id: `${RUN}-evt-1`,
      type: "invoice.payment_made",
      data: { object: { invoice: { id: squareInvoiceId } } },
    };
    const result = await ingestSquareEvent(fixture);
    expect(result.note).toMatch(/duplicate/);
    const payments = await prisma.payment.findMany({ where: { jobId } });
    expect(payments.length).toBe(2); // deposit + webhook payment, no third
  });

  it("a second webhook with the same squarePaymentId is also a no-op", async () => {
    const result = await ingestSquareEvent({
      event_id: `${RUN}-evt-2`,
      type: "payment.completed",
      data: {
        object: {
          payment: {
            id: `${RUN}-pay-1`,
            status: "COMPLETED",
            order_id: `${RUN}-sqord-1`,
            amount_money: { amount: 62000 },
          },
        },
      },
    });
    expect(result.note).toMatch(/payment posted/); // returns existing row
    const payments = await prisma.payment.findMany({ where: { jobId } });
    expect(payments.length).toBe(2);
  });

  it("unknown webhook events are acknowledged, not errors", async () => {
    const result = await ingestSquareEvent({
      event_id: `${RUN}-evt-3`,
      type: "team_member.updated",
    });
    expect(result.note).toMatch(/unhandled/);
  });

  it("a new invoice on a PAID job flips it back to ACTIVE with a system row", async () => {
    await createDepositInvoice({ jobId, amount: 50, stage: "Punch list" });
    const job = await prisma.job.findUniqueOrThrow({
      where: { id: jobId },
      include: { history: { orderBy: { id: "desc" } } },
    });
    expect(job.status).toBe("ACTIVE");
    expect(job.history[0].toStatus).toBe("ACTIVE");
    expect(job.history[0].changedBy).toBe("system");
  });

  it("money summary follows the §0 definition end to end", async () => {
    const m = await getJobMoneySummary(jobId);
    // billed: 300 (deposit) + 620 (final) + 50 (punch) = 970
    // paid: 300 + 620 = 920 · expenses: 100 · no permit on this job
    expect(m.billed).toBeCloseTo(970, 2);
    expect(m.paid).toBeCloseTo(920, 2);
    expect(m.outstanding).toBeCloseTo(50, 2);
    expect(m.expenses).toBeCloseTo(100, 2);
    expect(m.dougCut).toBe(0);
    expect(m.hasPermit).toBe(false);
    expect(m.net).toBeCloseTo(970 - 100 - 0, 2);
    expect(m.inHand).toBeCloseTo(920 - 100 - 0, 2);
  });

  it("stage label defaults behave sensibly", () => {
    expect(defaultStageLabel({ priorInvoiceCount: 0, billsEverythingRemaining: false })).toBe("Deposit");
    expect(defaultStageLabel({ priorInvoiceCount: 1, billsEverythingRemaining: false })).toBe("Progress 1");
    expect(defaultStageLabel({ priorInvoiceCount: 2, billsEverythingRemaining: true })).toBe("Final");
    expect(defaultStageLabel({ priorInvoiceCount: 0, billsEverythingRemaining: true })).toBe("Full amount");
  });
});
