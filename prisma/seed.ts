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

  // Markup default — placeholder 1.2 until Chris's real number is known.
  await prisma.appSetting.upsert({
    where: { key: "markup_default" },
    update: {},
    create: { key: "markup_default", value: "1.2" },
  });

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
  await prisma.invoice.create({
    data: { jobId: permitJob.id, totalAmount: 1500 },
  });

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
  await prisma.invoice.create({
    data: { jobId: projectJob.id, totalAmount: 5000 }, // first stage of staged billing
  });

  console.log("Seed complete: 2 users, 1 client, 2 jobs, 2 expenses, 2 invoices.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
