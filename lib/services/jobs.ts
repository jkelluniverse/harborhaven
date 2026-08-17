/**
 * Job lifecycle, ported from the source job module: creation writes an initial
 * status-history row; status changes append history; notes attach to the job.
 * Jobs are referred to by their plain id, shown as "#41" next to the client
 * name — no formatted job-number scheme.
 */
import { prisma } from "@/lib/db";
import type { Job, JobStatus, JobType, Prisma } from "@prisma/client";
import { ensureClient } from "./clients";
import { getMarkupDefault } from "./settings";

export interface CreateJobInput {
  clientName: string;
  name: string;
  address: string;
  type: JobType;
  markup?: number;
  createdBy: string;
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  const client = await ensureClient(input.clientName);
  if (!client) throw new Error("Client name is required");

  const markup = input.markup ?? (await getMarkupDefault());

  const job = await prisma.job.create({
    data: {
      clientId: client.id,
      name: input.name.trim(),
      address: input.address.trim(),
      type: input.type,
      status: "ESTIMATE",
      markup,
    },
  });

  await prisma.statusHistory.create({
    data: {
      jobId: job.id,
      fromStatus: null,
      toStatus: "ESTIMATE",
      changedBy: input.createdBy,
      note: "Job created",
    },
  });

  // A permit-only job starts with its permit (and the linked payable) as the
  // default first line.
  if (input.type === "PERMIT_ONLY") {
    const { addPermit } = await import("./line-items");
    await addPermit(job.id);
  }

  return job;
}

export async function updateJobStatus(
  jobId: number,
  status: JobStatus,
  changedBy: string,
  note?: string,
): Promise<Job> {
  const existing = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  if (existing.status !== status) {
    await prisma.statusHistory.create({
      data: { jobId, fromStatus: existing.status, toStatus: status, changedBy, note: note ?? null },
    });
  }
  return prisma.job.update({ where: { id: jobId }, data: { status } });
}

export async function addJobNote(jobId: number, note: string, author: string) {
  return prisma.jobNote.create({ data: { jobId, note, author } });
}

export type JobWithClient = Prisma.JobGetPayload<{ include: { client: true } }>;

export async function listJobs(status?: JobStatus): Promise<JobWithClient[]> {
  return prisma.job.findMany({
    where: status ? { status } : undefined,
    include: { client: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getJobDetail(jobId: number) {
  return prisma.job.findUnique({
    where: { id: jobId },
    include: {
      client: true,
      expenses: { orderBy: { createdAt: "desc" } },
      invoices: { include: { payments: true }, orderBy: { issuedAt: "asc" } },
      lineItems: { orderBy: { createdAt: "asc" } },
      payables: true,
      notes: { orderBy: { createdAt: "desc" } },
      history: { orderBy: { changedAt: "desc" } },
    },
  });
}
