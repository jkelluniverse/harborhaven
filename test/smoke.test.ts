/**
 * Write-path smoke suite (runs in CI and pre-deploy): create a client →
 * create a job → add an expense with a photo stub → create an invoice →
 * record a payment → assert the job money summary is correct.
 *
 * Needs a real Postgres via DATABASE_URL (CI provides a service container).
 * Uses throwaway names; safe to run repeatedly against a dev database.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createClient, findNearMatch } from "@/lib/services/clients";
import { createJob, updateJobStatus, getJobDetail } from "@/lib/services/jobs";
import { addExpense } from "@/lib/services/expenses";
import { createInvoice, recordPayment, getJobMoneySummary } from "@/lib/services/invoices";

const RUN = `smoke_${Date.now()}`;
const CLIENT_NAME = `Smoke Test Client ${RUN}`;

// 1×1 transparent PNG — the "photo stub". R2 is unconfigured in tests, so the
// upload path runs and degrades to photoUrl = null, matching the storage seam.
const PHOTO_STUB =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let jobId: number;

afterAll(async () => {
  // Remove everything this run created, children first.
  const jobs = await prisma.job.findMany({ where: { client: { name: CLIENT_NAME } } });
  const ids = jobs.map((j) => j.id);
  await prisma.payment.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.invoice.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.expense.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.jobNote.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.statusHistory.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.job.deleteMany({ where: { id: { in: ids } } });
  await prisma.client.deleteMany({ where: { name: CLIENT_NAME } });
  await prisma.$disconnect();
});

describe("write path", () => {
  it("creates a client", async () => {
    const client = await createClient({ name: CLIENT_NAME, phone: "941-555-0199" });
    expect(client.id).toBeGreaterThan(0);
    expect(client.name).toBe(CLIENT_NAME);
  });

  it("flags near-duplicate client names", () => {
    const near = findNearMatch(`smoke test client ${RUN}x`, [{ name: CLIENT_NAME }]);
    expect(near).toBe(CLIENT_NAME);
  });

  it("creates a job for the client with an initial history row", async () => {
    const job = await createJob({
      clientName: CLIENT_NAME,
      name: "Smoke project",
      address: "789 Test St, Sarasota, FL",
      type: "PROJECT",
      createdBy: "smoke",
    });
    jobId = job.id;
    expect(job.status).toBe("ESTIMATE");
    const detail = await getJobDetail(jobId);
    expect(detail?.history.at(-1)?.toStatus).toBe("ESTIMATE");
    expect(detail?.client.name).toBe(CLIENT_NAME);
  });

  it("adds an expense with a photo stub; clientPrice defaults to cost × markup", async () => {
    const expense = await addExpense({
      jobId,
      cost: 400,
      vendor: "Smoke Vendor",
      category: "materials",
      photoBase64: PHOTO_STUB,
    });
    expect(Number(expense.cost)).toBe(400);
    expect(Number(expense.clientPrice)).toBeCloseTo(480, 2); // 400 × 1.2 default markup
    expect(expense.billable).toBe(true);
    expect(expense.photoUrl).toBeNull(); // R2 unconfigured → seam degrades cleanly
  });

  it("supports staged billing: two invoices on one job", async () => {
    await updateJobStatus(jobId, "ACTIVE", "smoke");
    const first = await createInvoice({ jobId, totalAmount: 1000 });
    const second = await createInvoice({ jobId, totalAmount: 500 });
    expect(first.jobId).toBe(jobId);
    expect(second.jobId).toBe(jobId);
    expect(first.id).not.toBe(second.id);
  });

  it("records a payment that posts to invoice and job", async () => {
    const detail = await getJobDetail(jobId);
    const firstInvoice = detail!.invoices[0];
    const payment = await recordPayment({
      invoiceId: firstInvoice.id,
      amount: 1000,
      method: "OTHER",
      note: "check",
    });
    expect(payment.jobId).toBe(jobId);
    const after = await getJobDetail(jobId);
    expect(after!.invoices.find((i) => i.id === firstInvoice.id)!.status).toBe("PAID");
    // Second invoice unpaid → job must NOT be PAID yet.
    expect(after!.status).toBe("ACTIVE");
  });

  it("computes the job money summary: billed, paid, outstanding, expenses, net", async () => {
    const summary = await getJobMoneySummary(jobId);
    expect(summary.billed).toBe(1500); // 1000 + 500
    expect(summary.paid).toBe(1000);
    expect(summary.outstanding).toBe(500);
    expect(summary.expenses).toBe(400);
    expect(summary.net).toBe(600); // paid − expenses
  });

  it("flips the job to PAID when the last invoice is paid", async () => {
    const detail = await getJobDetail(jobId);
    const unpaid = detail!.invoices.find((i) => i.status === "UNPAID")!;
    await recordPayment({ invoiceId: unpaid.id, amount: 500, method: "SQUARE" });
    const after = await getJobDetail(jobId);
    expect(after!.status).toBe("PAID");
    const summary = await getJobMoneySummary(jobId);
    expect(summary.outstanding).toBe(0);
  });
});
