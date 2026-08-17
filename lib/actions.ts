"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { login as authLogin, logout as authLogout, requireSession, changePassword } from "@/lib/auth";
import { createClient, updateClient, findNearMatch } from "@/lib/services/clients";
import { createJob, updateJobStatus, addJobNote } from "@/lib/services/jobs";
import { addExpense } from "@/lib/services/expenses";
import { createInvoiceFromLineItems, createDepositInvoice, recordPayment } from "@/lib/services/invoices";
import { addLineItem, addPermit, addExpenseToBill, removeLineItem } from "@/lib/services/line-items";
import { markPayablePaid, undoPayablePaid } from "@/lib/services/payables";
import { sendInvoiceViaSquare, cancelInvoiceEverywhere } from "@/lib/services/square-invoices";
import { sendEstimate } from "@/lib/services/estimates";
import { createLeadOrAppend, startEstimate, archiveLead } from "@/lib/services/leads";
import { logVisit, sendVisitReport, type ChecklistEntry } from "@/lib/services/visits";
import { sendSms } from "@/lib/sms";
import { prisma } from "@/lib/db";

export type FormState = { error?: string; confirm?: string } | null;

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const session = await authLogin(username, password);
  if (!session) return { error: "Wrong username or password. Try again." };
  redirect("/app/jobs");
}

export async function logoutAction() {
  await authLogout();
  redirect("/login");
}

const jobSchema = z.object({
  clientName: z.string().min(1, "Client name is required"),
  name: z.string().min(1, "Job name is required"),
  address: z.string().min(1, "Address is required"),
  type: z.enum(["PERMIT_ONLY", "PROJECT", "HOME_WATCH", "OTHER"]),
  visitFrequency: z.enum(["WEEKLY", "BIWEEKLY", "CUSTOM"]).optional(),
});

export async function createJobAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const parsed = jobSchema.safeParse({
    clientName: formData.get("clientName"),
    name: formData.get("name"),
    address: formData.get("address"),
    type: formData.get("type"),
    visitFrequency: formData.get("visitFrequency") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // "Did you mean…?" guard — block once, pass when the user confirms.
  if (formData.get("confirmedName") !== parsed.data.clientName) {
    const existing = await prisma.client.findMany({ select: { name: true } });
    const near = findNearMatch(parsed.data.clientName, existing);
    if (near) return { error: `Did you mean "${near}"? Pick them from the list, or tap Save again to create "${parsed.data.clientName}" as a new client.`, confirm: parsed.data.clientName };
  }

  const job = await createJob({ ...parsed.data, createdBy: session.username });
  redirect(`/app/jobs/${job.id}`);
}

export async function updateJobStatusAction(jobId: number, formData: FormData) {
  const session = await requireSession();
  const status = z.enum(["ESTIMATE", "ACTIVE", "DONE", "PAID"]).parse(formData.get("status"));
  await updateJobStatus(jobId, status, session.username);
  revalidatePath(`/app/jobs/${jobId}`);
}

export async function addJobNoteAction(jobId: number, formData: FormData) {
  const session = await requireSession();
  const note = String(formData.get("note") ?? "").trim();
  if (note) await addJobNote(jobId, note, session.username);
  revalidatePath(`/app/jobs/${jobId}`);
}

export async function addExpenseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const jobId = Number(formData.get("jobId"));
  const cost = Number(formData.get("cost"));
  if (!Number.isFinite(cost) || cost <= 0) return { error: "Enter the amount you paid." };

  const clientPriceRaw = String(formData.get("clientPrice") ?? "").trim();
  const clientPrice = clientPriceRaw ? Number(clientPriceRaw) : null;
  if (clientPrice != null && !Number.isFinite(clientPrice)) return { error: "Client price must be a number." };

  let photoBase64: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > 10 * 1024 * 1024) return { error: "Photo is too large (10 MB max)." };
    const buf = Buffer.from(await photo.arrayBuffer());
    photoBase64 = `data:${photo.type || "image/jpeg"};base64,${buf.toString("base64")}`;
  }

  await addExpense({
    jobId,
    cost,
    clientPrice,
    billable: formData.get("billable") !== null,
    category: String(formData.get("category") ?? "") || null,
    vendor: String(formData.get("vendor") ?? "") || null,
    notes: String(formData.get("notes") ?? "") || null,
    photoBase64,
  });
  redirect(`/app/jobs/${jobId}`);
}

export async function createInvoiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const jobId = Number(formData.get("jobId"));
  const mode = String(formData.get("mode") ?? "items");
  const dueRaw = String(formData.get("dueDate") ?? "").trim();
  const stage = String(formData.get("stage") ?? "").trim() || null;
  const dueDate = dueRaw ? new Date(dueRaw) : null;
  try {
    if (mode === "deposit") {
      const amount = Number(formData.get("amount"));
      if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the deposit amount." };
      await createDepositInvoice({ jobId, amount, stage, dueDate });
    } else {
      const ids = formData.getAll("lineItemIds").map(Number).filter(Number.isInteger);
      await createInvoiceFromLineItems({ jobId, lineItemIds: ids, stage, dueDate });
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't create the invoice." };
  }
  redirect(`/app/jobs/${jobId}`);
}

// ---- Line items & permits ----

export async function addLineItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const jobId = Number(formData.get("jobId"));
  const description = String(formData.get("description") ?? "").trim();
  const unitPrice = Number(formData.get("unitPrice"));
  const qty = Number(formData.get("qty") || 1);
  const kind = z
    .enum(["PERMIT", "MANAGEMENT_FEE", "MATERIALS", "LABOR", "HOME_WATCH_VISIT", "OTHER"])
    .catch("OTHER")
    .parse(formData.get("kind"));
  if (!description) return { error: "Describe the line item." };
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return { error: "Enter a price." };
  if (!Number.isFinite(qty) || qty <= 0) return { error: "Quantity must be positive." };
  if (kind === "PERMIT") {
    await addPermit(jobId);
  } else {
    await addLineItem({ jobId, description, qty, unitPrice, kind });
  }
  redirect(`/app/jobs/${jobId}`);
}

export async function addPermitAction(jobId: number) {
  await requireSession();
  await addPermit(jobId);
  revalidatePath(`/app/jobs/${jobId}`);
  revalidatePath("/app/doug");
}

export async function addExpenseToBillAction(jobId: number, formData: FormData) {
  await requireSession();
  const expenseId = Number(formData.get("expenseId"));
  await addExpenseToBill(expenseId);
  revalidatePath(`/app/jobs/${jobId}`);
}

export async function removeLineItemAction(jobId: number, formData: FormData): Promise<void> {
  await requireSession();
  const lineItemId = Number(formData.get("lineItemId"));
  try {
    await removeLineItem(lineItemId);
  } catch (e) {
    // Surface the plain-English block reason on the job page.
    redirect(`/app/jobs/${jobId}?msg=${encodeURIComponent(e instanceof Error ? e.message : "Couldn't remove item")}`);
  }
  revalidatePath(`/app/jobs/${jobId}`);
  revalidatePath("/app/doug");
}

// ---- Doug / payables ----

export async function markPayablePaidAction(formData: FormData) {
  await requireSession();
  const payableId = Number(formData.get("payableId"));
  const paidVia = String(formData.get("paidVia") ?? "Other");
  await markPayablePaid(payableId, paidVia);
  revalidatePath("/app/doug");
}

export async function undoPayablePaidAction(formData: FormData) {
  await requireSession();
  const payableId = Number(formData.get("payableId"));
  try {
    await undoPayablePaid(payableId);
  } catch {
    // window passed — the page re-render will drop the undo button
  }
  revalidatePath("/app/doug");
}

// ---- Square invoice lifecycle ----

export async function sendInvoiceAction(invoiceId: number): Promise<void> {
  await requireSession();
  const result = await sendInvoiceViaSquare(invoiceId);
  revalidatePath(`/app/invoices/${invoiceId}`);
  if (!result.ok) {
    redirect(`/app/invoices/${invoiceId}?msg=${encodeURIComponent(result.error)}`);
  }
  redirect(`/app/invoices/${invoiceId}?msg=${encodeURIComponent("Invoice sent — Square emailed the payment link.")}`);
}

export async function cancelInvoiceAction(invoiceId: number): Promise<void> {
  await requireSession();
  try {
    await cancelInvoiceEverywhere(invoiceId);
  } catch (e) {
    redirect(`/app/invoices/${invoiceId}?msg=${encodeURIComponent(e instanceof Error ? e.message : "Couldn't cancel.")}`);
  }
  revalidatePath(`/app/invoices/${invoiceId}`);
  redirect(`/app/invoices/${invoiceId}?msg=${encodeURIComponent("Invoice canceled.")}`);
}

export async function markPaidOtherWayAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const invoiceId = Number(formData.get("invoiceId"));
  const amount = Number(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim();
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the amount received." };
  if (!note) return { error: "Say how it was paid (Venmo, Zelle, check, cash…)." };
  await recordPayment({ invoiceId, amount, method: "OTHER", note });
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { jobId: true } });
  revalidatePath(`/app/invoices/${invoiceId}`);
  if (inv) revalidatePath(`/app/jobs/${inv.jobId}`);
  return null;
}

// ---- Estimates ----

export async function sendEstimateAction(jobId: number): Promise<void> {
  await requireSession();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const result = await sendEstimate(jobId, `${proto}://${host}`);
  revalidatePath(`/app/jobs/${jobId}`);
  const msg = !result.ok
    ? result.error
    : result.emailed
      ? "Estimate emailed."
      : `Estimate page ready — share this link: ${result.url}`;
  redirect(`/app/jobs/${jobId}?msg=${encodeURIComponent(msg)}`);
}

// ---- Leads ----

export async function startEstimateAction(clientId: number) {
  const session = await requireSession();
  const job = await startEstimate(clientId, session.username);
  revalidatePath("/app/clients");
  redirect(`/app/jobs/${job.id}`);
}

export async function archiveLeadAction(clientId: number, formData: FormData) {
  await requireSession();
  const reason = String(formData.get("reason") ?? "").trim();
  await archiveLead(clientId, reason);
  revalidatePath("/app/clients");
  redirect("/app/clients");
}

export async function appendLeadNoteAction(clientId: number, formData: FormData) {
  const session = await requireSession();
  const note = String(formData.get("note") ?? "").trim();
  if (note) {
    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    const line = `${new Date().toLocaleDateString("en-US")} (${session.username}): ${note}`;
    await prisma.client.update({
      where: { id: clientId },
      data: { leadNotes: client.leadNotes ? `${client.leadNotes}\n\n${line}` : line },
    });
  }
  revalidatePath(`/app/clients/${clientId}`);
}

/** Manual "Add client" — writes the identical lead-shaped record. */
export async function addClientLeadAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name) return { error: "Name is required." };
  if (!phone) return { error: "Phone is required." };
  const source = z.enum(["WEBSITE", "PHONE", "REFERRAL", "OTHER"]).catch("PHONE").parse(formData.get("source"));
  const service = z
    .enum(["Home Watch", "Permit only", "Project", "Something else"])
    .catch("Something else")
    .parse(formData.get("serviceRequested"));
  const { client } = await createLeadOrAppend({
    name,
    phone,
    email: String(formData.get("email") ?? "").trim() || null,
    propertyAddress: String(formData.get("propertyAddress") ?? "").trim() || "—",
    serviceRequested: service,
    details: String(formData.get("details") ?? "").trim() || null,
    preferredDates: String(formData.get("preferredDates") ?? "").trim() || null,
    source,
  });
  redirect(`/app/clients/${client.id}`);
}

// ---- Home-watch visits ----

export async function logVisitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const jobId = Number(formData.get("jobId"));
  const sendReport = formData.get("sendReport") === "yes";

  let checklist: ChecklistEntry[];
  try {
    checklist = JSON.parse(String(formData.get("checklist") ?? "[]")) as ChecklistEntry[];
    if (!Array.isArray(checklist) || checklist.length === 0) throw new Error();
  } catch {
    return { error: "Checklist didn't come through — try again." };
  }

  const photosBase64: string[] = [];
  for (const value of formData.getAll("photos")) {
    if (value instanceof File && value.size > 0) {
      if (value.size > 10 * 1024 * 1024) return { error: "One of the photos is too large (10 MB max)." };
      const buf = Buffer.from(await value.arrayBuffer());
      photosBase64.push(`data:${value.type || "image/jpeg"};base64,${buf.toString("base64")}`);
    }
  }

  const visit = await logVisit({
    jobId,
    checklist,
    notes: String(formData.get("notes") ?? "") || null,
    photosBase64,
  });

  let msg = "Visit logged.";
  if (sendReport) {
    const result = await sendVisitReport(visit.id);
    msg = !result.ok
      ? result.error
      : result.emailed
        ? "Visit logged and report sent."
        : "Visit logged — email isn't set up, so the report wasn't sent.";
  }
  redirect(`/app/jobs/${jobId}?msg=${encodeURIComponent(msg)}`);
}

export async function resendVisitReportAction(visitId: number): Promise<void> {
  await requireSession();
  const visit = await prisma.visit.findUniqueOrThrow({ where: { id: visitId } });
  const result = await sendVisitReport(visitId);
  const msg = !result.ok
    ? result.error
    : result.emailed
      ? "Report sent."
      : "Email isn't set up — report stored but not sent.";
  redirect(`/app/jobs/${visit.jobId}?msg=${encodeURIComponent(msg)}`);
}

// ---- SMS the payment link ----

export async function textInvoiceLinkAction(invoiceId: number): Promise<void> {
  await requireSession();
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { job: { include: { client: true } } },
  });
  const phone = invoice.job.client.phone;
  if (!invoice.publicUrl || !phone) {
    redirect(`/app/invoices/${invoiceId}?msg=${encodeURIComponent(!phone ? "No phone on file for this client." : "Send the invoice first — there's no payment link yet.")}`);
  }
  const ok = await sendSms(
    phone!,
    `Harbor Haven Home Watch — your invoice${invoice.stage ? ` (${invoice.stage})` : ""} is ready. Pay by bank transfer (free) or card: ${invoice.publicUrl}`,
  );
  redirect(`/app/invoices/${invoiceId}?msg=${encodeURIComponent(ok ? "Payment link texted." : "Text didn't go through (SMS not set up?) — the link still works from the button above.")}`);
}

// ---- Me / change password ----

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const result = await changePassword(
    session.id,
    String(formData.get("currentPassword") ?? ""),
    String(formData.get("newPassword") ?? ""),
  );
  if (!result.ok) return { error: result.error };
  return { error: undefined, confirm: "done" };
}

export async function recordPaymentAction(jobId: number, formData: FormData) {
  await requireSession();
  const invoiceId = Number(formData.get("invoiceId"));
  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return;
  const method = formData.get("method") === "SQUARE" ? "SQUARE" : "OTHER";
  await recordPayment({
    invoiceId,
    amount,
    method,
    note: String(formData.get("note") ?? "") || null,
  });
  revalidatePath(`/app/jobs/${jobId}`);
  revalidatePath("/app/invoices");
}

const clientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
});

export async function createClientAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const parsed = clientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (formData.get("confirmedName") !== parsed.data.name) {
    const existing = await prisma.client.findMany({ select: { name: true } });
    const near = findNearMatch(parsed.data.name, existing);
    if (near) return { error: `Did you mean "${near}"? Tap Save again to create "${parsed.data.name}" anyway.`, confirm: parsed.data.name };
  }

  const client = await createClient(parsed.data);
  redirect(`/app/clients/${client.id}`);
}

export async function updateClientAction(clientId: number, formData: FormData) {
  await requireSession();
  await updateClient(clientId, {
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  revalidatePath(`/app/clients/${clientId}`);
}
