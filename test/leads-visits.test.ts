/**
 * HH-03 smoke additions: lead intake (create, dedupe-append), Start estimate,
 * home-watch visits (log → line item, report → reportSentAt + nextVisitDue
 * advance), auth middleware gating, and the no-auto-PAID rule for home-watch
 * jobs. Resend is mocked at the email module boundary; Twilio is unconfigured
 * so SMS logs as skipped.
 */
import { describe, it, expect, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createLeadOrAppend, startEstimate, archiveLead } from "@/lib/services/leads";
import { logVisit, sendVisitReport, DEFAULT_CHECKLIST } from "@/lib/services/visits";
import { createDepositInvoice, recordPayment } from "@/lib/services/invoices";
import { middleware } from "@/middleware";

vi.mock("@/lib/email", () => ({
  emailConfigured: () => true,
  sendEmail: vi.fn(async () => true),
}));

const RUN = `hh03_${Date.now()}`;
const LEAD_NAME = `Lead Test Person ${RUN}`;
const LEAD_PHONE = `941555${String(Date.now()).slice(-4)}`;

afterAll(async () => {
  const clients = await prisma.client.findMany({ where: { name: { contains: RUN } } });
  const jobs = await prisma.job.findMany({ where: { clientId: { in: clients.map((c) => c.id) } } });
  const ids = jobs.map((j) => j.id);
  await prisma.visit.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.payable.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.lineItem.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.invoice.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.expense.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.jobNote.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.statusHistory.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.job.deleteMany({ where: { id: { in: ids } } });
  await prisma.client.deleteMany({ where: { id: { in: clients.map((c) => c.id) } } });
  await prisma.$disconnect();
});

describe("lead intake", () => {
  let clientId: number;

  it("website submit creates a LEAD client", async () => {
    const { client, isNew } = await createLeadOrAppend({
      name: LEAD_NAME,
      phone: LEAD_PHONE,
      email: `lead-${RUN}@example.com`,
      propertyAddress: "77 Seagrape Ln, Sarasota, FL",
      serviceRequested: "Home Watch",
      details: "Away May–November",
      source: "WEBSITE",
    });
    clientId = client.id;
    expect(isNew).toBe(true);
    expect(client.status).toBe("LEAD");
    expect(client.source).toBe("WEBSITE");
    expect(client.leadNotes).toMatch(/New request via website/);
  });

  it("duplicate submit (same phone) appends a note, no new client", async () => {
    const before = await prisma.client.count();
    const { client, isNew } = await createLeadOrAppend({
      name: `Different Spelling ${RUN}`,
      phone: `1${LEAD_PHONE}`, // same number, +1 prefix
      propertyAddress: "77 Seagrape Ln, Sarasota, FL",
      serviceRequested: "Project",
      source: "WEBSITE",
    });
    expect(isNew).toBe(false);
    expect(client.id).toBe(clientId);
    expect((client.leadNotes ?? "").match(/New request via website/g)?.length).toBe(2);
    expect(await prisma.client.count()).toBe(before);
  });

  it("Start estimate creates the job and flips the client ACTIVE", async () => {
    const job = await startEstimate(clientId, "test");
    expect(job.type).toBe("HOME_WATCH"); // inferred from "Home Watch" radio
    expect(job.address).toBe("77 Seagrape Ln, Sarasota, FL");
    expect(job.status).toBe("ACTIVE");
    expect(job.nextVisitDue).not.toBeNull();
    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    expect(client.status).toBe("ACTIVE");
  });

  it("Not a fit archives with a reason (fresh lead)", async () => {
    const { client } = await createLeadOrAppend({
      name: `Archive Me ${RUN}`,
      phone: `941556${String(Date.now()).slice(-4)}`,
      propertyAddress: "1 Nowhere St",
      serviceRequested: "Something else",
      source: "PHONE",
    });
    const archived = await archiveLead(client.id, "Outside service area");
    expect(archived.status).toBe("ARCHIVED");
    expect(archived.archiveReason).toBe("Outside service area");
  });
});

describe("home-watch visits", () => {
  it("log visit stores it, creates the line item, report advances nextVisitDue", async () => {
    const job = await prisma.job.findFirstOrThrow({
      where: { type: "HOME_WATCH", client: { name: LEAD_NAME } },
    });
    const before = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });

    const visit = await logVisit({
      jobId: job.id,
      checklist: DEFAULT_CHECKLIST.map((item) =>
        item === "Humidity" ? { item, ok: false, note: "68% — dehumidifier tripped" } : { item, ok: true },
      ),
      notes: "Humidity at 68% — dehumidifier tripped.",
      photosBase64: [], // storage seam untouched; photo path covered in smoke.test
    });
    expect(visit.id).toBeGreaterThan(0);

    const lineItems = await prisma.lineItem.findMany({
      where: { jobId: job.id, kind: "HOME_WATCH_VISIT" },
    });
    expect(lineItems.length).toBe(1);
    expect(lineItems[0].invoiceId).toBeNull(); // unbilled until monthly invoice
    expect(Number(lineItems[0].unitPrice)).toBe(75); // visit_rate default

    const result = await sendVisitReport(visit.id);
    expect(result.ok && result.emailed).toBe(true);

    const after = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } });
    expect(after.reportSentAt).not.toBeNull();
    expect(after.reportHtml).toMatch(/Flagged — /);

    const jobAfter = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(jobAfter.nextVisitDue!.getTime()).toBeGreaterThan(before.nextVisitDue!.getTime());
  });

  it("paying all invoices never auto-flips a home-watch job to PAID", async () => {
    const job = await prisma.job.findFirstOrThrow({
      where: { type: "HOME_WATCH", client: { name: LEAD_NAME } },
    });
    const invoice = await createDepositInvoice({ jobId: job.id, amount: 75, stage: "Monthly" });
    await recordPayment({ invoiceId: invoice.id, amount: 75, method: "OTHER", note: "check" });
    const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(paid.status).toBe("PAID");
    const after = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("ACTIVE");
  });
});

describe("route gating", () => {
  const make = (path: string) => new NextRequest(`https://harborhavenhomewatch.com${path}`);

  it("unauthenticated /app/* redirects to /login", async () => {
    for (const path of ["/app", "/app/jobs", "/app/clients/1", "/api/app/anything"]) {
      const res = await middleware(make(path));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    }
  });

  it("public routes pass through untouched", async () => {
    for (const path of ["/", "/quote", "/thanks", "/login", "/e/sometoken", "/api/lead", "/api/square/webhook"]) {
      const res = await middleware(make(path));
      expect(res.status).toBe(200); // NextResponse.next()
      expect(res.headers.get("location")).toBeNull();
    }
  });
});
