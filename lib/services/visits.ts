/**
 * Home-watch visits: checklist + photos + notes, an emailed report the client
 * can trust (stored for resend), and an unbilled HOME_WATCH_VISIT line item
 * per visit so Chris bills monthly with the normal invoice flow.
 */
import { prisma } from "@/lib/db";
import type { Visit } from "@prisma/client";
import { sendEmail } from "@/lib/email";
import { uploadBase64 } from "@/lib/storage";

export const DEFAULT_CHECKLIST = [
  "Exterior",
  "Doors/windows locked",
  "AC/thermostat",
  "Humidity",
  "Water/leaks",
  "Pests",
  "Pool/lanai",
  "Mail/deliveries",
  "Other",
] as const;

export interface ChecklistEntry {
  item: string;
  ok: boolean;
  note?: string;
}

export interface VisitPhoto {
  key: string;
  url: string;
}

export interface LogVisitInput {
  jobId: number;
  checklist: ChecklistEntry[];
  notes?: string | null;
  photosBase64?: string[]; // data URLs
}

export async function logVisit(input: LogVisitInput): Promise<Visit> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: input.jobId } });
  if (job.type !== "HOME_WATCH") throw new Error("Visits belong to home-watch jobs");

  const photos: VisitPhoto[] = [];
  for (const [i, dataUrl] of (input.photosBase64 ?? []).entries()) {
    const stored = await uploadBase64(dataUrl, `visit_job${job.id}_${i}`);
    if (stored) photos.push({ key: stored.key, url: stored.url });
  }

  const visit = await prisma.visit.create({
    data: {
      jobId: job.id,
      checklist: input.checklist as object[],
      notes: input.notes?.trim() || null,
      photos: photos as unknown as object[],
    },
  });

  // The visit becomes an unbilled line item at the job's visit rate.
  const rate = Number(job.visitRate ?? 0);
  if (rate > 0) {
    await prisma.lineItem.create({
      data: {
        jobId: job.id,
        description: `Home watch visit — ${visit.visitedAt.toLocaleDateString("en-US")}`,
        qty: 1,
        unitPrice: rate,
        kind: "HOME_WATCH_VISIT",
      },
    });
  }

  return visit;
}

function advanceDate(from: Date, frequency: string | null): Date {
  const days = frequency === "BIWEEKLY" ? 14 : 7; // CUSTOM advances a week; Chris can adjust
  const next = new Date(from);
  next.setDate(next.getDate() + days);
  return next;
}

export function buildReportHtml(args: {
  clientFirstName: string;
  jobName: string;
  address: string;
  visitedAt: Date;
  checklist: ChecklistEntry[];
  notes?: string | null;
  photos: VisitPhoto[];
}): string {
  const rows = args.checklist
    .map(
      (c) =>
        `<tr><td style="padding:6px 12px 6px 0;">${c.item}</td><td style="padding:6px 0;font-weight:bold;color:${c.ok ? "#166534" : "#b91c1c"};">${c.ok ? "OK" : "Flagged"}${c.note ? ` — ${c.note}` : ""}</td></tr>`,
    )
    .join("");
  const photoImgs = args.photos
    .map((p) => `<img src="${p.url}" alt="Visit photo" style="max-width:100%;border-radius:8px;margin-top:8px;" />`)
    .join("");
  return `
  <div style="font-family:Georgia,serif;font-size:18px;color:#22303a;max-width:520px;">
    <h2 style="color:#14384f;">Harbor Haven Home Watch — Visit report</h2>
    <p>Hi ${args.clientFirstName},</p>
    <p>We checked <strong>${args.address}</strong> on
       <strong>${args.visitedAt.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;font-size:18px;">${rows}</table>
    ${args.notes ? `<p><strong>Notes:</strong> ${args.notes}</p>` : ""}
    ${photoImgs}
    <p style="margin-top:16px;">Anything look off, call Chris: <a href="tel:+19419612252">(941) 961-2252</a>.</p>
    <p>— Harbor Haven Home Watch</p>
  </div>`;
}

export type ReportResult = { ok: true; emailed: boolean } | { ok: false; error: string };

/** Build + store the report, email it, mark sent, and advance nextVisitDue. */
export async function sendVisitReport(visitId: number): Promise<ReportResult> {
  const visit = await prisma.visit.findUniqueOrThrow({
    where: { id: visitId },
    include: { job: { include: { client: true } } },
  });
  const client = visit.job.client;
  if (!client.email) {
    return { ok: false, error: `${client.name} has no email on file — add one on the client screen, then resend.` };
  }

  const html = buildReportHtml({
    clientFirstName: client.name.split(" ")[0],
    jobName: visit.job.name,
    address: visit.job.address,
    visitedAt: visit.visitedAt,
    checklist: visit.checklist as unknown as ChecklistEntry[],
    notes: visit.notes,
    photos: (visit.photos as unknown as VisitPhoto[]) ?? [],
  });

  const emailed = await sendEmail({
    to: client.email,
    subject: `Visit report — ${visit.job.address} — ${visit.visitedAt.toLocaleDateString("en-US")}`,
    html,
  });

  await prisma.visit.update({
    where: { id: visit.id },
    data: { reportHtml: html, ...(emailed ? { reportSentAt: new Date() } : {}) },
  });

  if (emailed) {
    await prisma.job.update({
      where: { id: visit.jobId },
      data: { nextVisitDue: advanceDate(visit.visitedAt, visit.job.visitFrequency) },
    });
  }

  return { ok: true, emailed };
}
