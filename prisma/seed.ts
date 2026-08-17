/**
 * Harbor Haven seed — fake data only. One test client, one permit-only job,
 * one project job with two expenses and one staged invoice.
 *
 * Login credentials are placeholders for local/staging; rotate before any
 * real use (see KNOWN-LIMITS.md).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Users: single owner login (Chris) + one admin (Jacob).
  const users = [
    { name: "Chris", username: "chris", role: "OWNER" as const, password: "harborhaven" },
    { name: "Jacob", username: "jacob", role: "ADMIN" as const, password: "harborhaven" },
  ];
  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: { name: u.name, username: u.username, role: u.role, passwordHash },
    });
  }

  // Settings — markup is a placeholder until Chris's real number is known;
  // permit numbers are the standing deal ($1,500 to client, $500 to Doug).
  const settings: Record<string, string> = {
    default_markup: "1.2",
    permit_price: "1500",
    permit_payable: "500",
    permit_payee_name: "Doug Prestier",
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.appSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  // Fake test client.
  const client = await prisma.client.upsert({
    where: { name: "Pat Sample" },
    update: {},
    create: {
      name: "Pat Sample",
      phone: "941-555-0100",
      email: "pat.sample@example.com",
      notes: "Seed data — not a real person.",
    },
  });

  if (await prisma.job.count()) {
    console.log("Jobs already present — skipping job seed.");
    return;
  }

  // Permit-only job.
  const permitJob = await prisma.job.create({
    data: {
      clientId: client.id,
      name: "Lanai enclosure permit",
      address: "123 Example Key, Sarasota, FL",
      type: "PERMIT_ONLY",
      status: "ACTIVE",
      markup: 1.2,
    },
  });
  await prisma.statusHistory.create({
    data: { jobId: permitJob.id, toStatus: "ESTIMATE", changedBy: "seed", note: "Job created" },
  });
  // The permit pattern: PERMIT line item + linked payable to Doug.
  const permitItem = await prisma.lineItem.create({
    data: { jobId: permitJob.id, description: "Permit", qty: 1, unitPrice: 1500, kind: "PERMIT" },
  });
  await prisma.payable.create({
    data: { jobId: permitJob.id, lineItemId: permitItem.id, payeeName: "Doug Prestier", amount: 500 },
  });
  const permitInvoice = await prisma.invoice.create({
    data: { jobId: permitJob.id, totalAmount: 1500, stage: "Full amount" },
  });
  await prisma.lineItem.update({ where: { id: permitItem.id }, data: { invoiceId: permitInvoice.id } });

  // Project job with two expenses and one staged invoice (first of several).
  const projectJob = await prisma.job.create({
    data: {
      clientId: client.id,
      name: "Guest bath remodel",
      address: "456 Placeholder Ave, Sarasota, FL",
      type: "PROJECT",
      status: "ACTIVE",
      markup: 1.2,
    },
  });
  await prisma.statusHistory.create({
    data: { jobId: projectJob.id, toStatus: "ESTIMATE", changedBy: "seed", note: "Job created" },
  });
  await prisma.expense.createMany({
    data: [
      {
        jobId: projectJob.id,
        cost: 850,
        clientPrice: 1020, // 850 × 1.2
        billable: true,
        category: "materials",
        vendor: "Sample Supply Co",
        notes: "Tile and backer board",
      },
      {
        jobId: projectJob.id,
        cost: 1200,
        clientPrice: 1440, // 1200 × 1.2
        billable: true,
        category: "subcontractor",
        vendor: "Example Plumbing LLC",
        notes: "Rough-in",
      },
    ],
  });
  // First stage of staged billing: a deposit invoice with its own line item.
  const depositInvoice = await prisma.invoice.create({
    data: { jobId: projectJob.id, totalAmount: 5000, stage: "Deposit" },
  });
  await prisma.lineItem.create({
    data: {
      jobId: projectJob.id,
      invoiceId: depositInvoice.id,
      description: "Deposit — Guest bath remodel",
      qty: 1,
      unitPrice: 5000,
      kind: "OTHER",
    },
  });

  console.log("Seed complete: 2 users, 1 client, 2 jobs, 2 expenses, 2 invoices, 1 permit + payable.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
