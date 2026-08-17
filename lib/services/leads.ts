/**
 * Lead intake: website form (and manual add) → Client rows with LEAD status.
 * A submission matching an existing client by normalized phone or email
 * appends a note instead of creating a duplicate. "Start estimate" turns a
 * lead into an ACTIVE client with a job; "Not a fit" archives with a reason.
 */
import { prisma } from "@/lib/db";
import type { Client, ClientSource } from "@prisma/client";
import { createJob } from "./jobs";
import { getNumberSetting } from "./settings";

export interface LeadInput {
  name: string;
  phone: string;
  email?: string | null;
  propertyAddress: string;
  serviceRequested: string;
  details?: string | null;
  preferredDates?: string | null;
  source?: ClientSource;
}

function normPhone(p: string): string {
  return p.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}

function stamp(): string {
  return new Date().toLocaleDateString("en-US");
}

export type LeadResult = { client: Client; isNew: boolean };

export async function createLeadOrAppend(input: LeadInput): Promise<LeadResult> {
  const phone = input.phone.trim();
  const email = input.email?.trim().toLowerCase() || null;
  const wantedPhone = normPhone(phone);

  // Duplicate guard: same phone (normalized) or same email → append, don't twin.
  const candidates = await prisma.client.findMany({
    where: email ? { OR: [{ email: { equals: email, mode: "insensitive" } }, { phone: { not: null } }] } : { phone: { not: null } },
  });
  const existing = candidates.find(
    (c) =>
      (email && c.email?.toLowerCase() === email) ||
      (wantedPhone && c.phone && normPhone(c.phone) === wantedPhone),
  );

  const requestLine = `New request via ${input.source === "PHONE" ? "phone" : "website"} ${stamp()}: ${input.serviceRequested} at ${input.propertyAddress}.${input.details ? ` "${input.details.trim()}"` : ""}${input.preferredDates ? ` When: ${input.preferredDates.trim()}` : ""}`;

  if (existing) {
    const client = await prisma.client.update({
      where: { id: existing.id },
      data: {
        leadNotes: existing.leadNotes ? `${existing.leadNotes}\n\n${requestLine}` : requestLine,
        // A fresh request un-archives; an ACTIVE client stays ACTIVE.
        ...(existing.status === "ARCHIVED" ? { status: "LEAD" as const, archiveReason: null } : {}),
        ...(existing.propertyAddress ? {} : { propertyAddress: input.propertyAddress.trim() }),
        ...(existing.serviceRequested ? {} : { serviceRequested: input.serviceRequested }),
      },
    });
    return { client, isNew: false };
  }

  // Unique name guard: two different "John Smith"s are both real — suffix the
  // second rather than reject the lead.
  let name = input.name.trim();
  if (await prisma.client.findUnique({ where: { name } })) {
    name = `${name} (${phone.slice(-4) || "new"})`;
  }

  const client = await prisma.client.create({
    data: {
      name,
      phone,
      email,
      status: "LEAD",
      source: input.source ?? "WEBSITE",
      propertyAddress: input.propertyAddress.trim(),
      serviceRequested: input.serviceRequested,
      leadNotes: requestLine,
      preferredDates: input.preferredDates?.trim() || null,
    },
  });
  return { client, isNew: true };
}

const SERVICE_TO_JOB_TYPE: Record<string, "HOME_WATCH" | "PERMIT_ONLY" | "PROJECT" | "OTHER"> = {
  "Home Watch": "HOME_WATCH",
  "Permit only": "PERMIT_ONLY",
  Project: "PROJECT",
  "Something else": "OTHER",
};

/** One big button: lead → ACTIVE client + a job with the address pre-filled. */
export async function startEstimate(clientId: number, createdBy: string) {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  const type = SERVICE_TO_JOB_TYPE[client.serviceRequested ?? ""] ?? "OTHER";

  const job = await createJob({
    clientName: client.name,
    name: client.serviceRequested || "New job",
    address: client.propertyAddress || "",
    type,
    createdBy,
    ...(type === "HOME_WATCH"
      ? {
          visitFrequency: "WEEKLY" as const,
          visitRate: await getNumberSetting("visit_rate"),
        }
      : {}),
  });
  await prisma.client.update({ where: { id: clientId }, data: { status: "ACTIVE" } });
  return job;
}

export async function archiveLead(clientId: number, reason: string): Promise<Client> {
  return prisma.client.update({
    where: { id: clientId },
    data: { status: "ARCHIVED", archiveReason: reason.trim() || "Not a fit" },
  });
}

export async function leadCount(): Promise<number> {
  return prisma.client.count({ where: { status: "LEAD" } });
}
