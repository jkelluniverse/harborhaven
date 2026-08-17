"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { login as authLogin, logout as authLogout, requireSession } from "@/lib/auth";
import { createClient, updateClient, findNearMatch } from "@/lib/services/clients";
import { createJob, updateJobStatus, addJobNote } from "@/lib/services/jobs";
import { addExpense } from "@/lib/services/expenses";
import { createInvoice, recordPayment } from "@/lib/services/invoices";
import { prisma } from "@/lib/db";

export type FormState = { error?: string; confirm?: string } | null;

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const session = await authLogin(username, password);
  if (!session) return { error: "Wrong username or password. Try again." };
  redirect("/jobs");
}

export async function logoutAction() {
  await authLogout();
  redirect("/login");
}

const jobSchema = z.object({
  clientName: z.string().min(1, "Client name is required"),
  name: z.string().min(1, "Job name is required"),
  address: z.string().min(1, "Address is required"),
  type: z.enum(["PERMIT_ONLY", "PROJECT", "OTHER"]),
});

export async function createJobAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const parsed = jobSchema.safeParse({
    clientName: formData.get("clientName"),
    name: formData.get("name"),
    address: formData.get("address"),
    type: formData.get("type"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // "Did you mean…?" guard — block once, pass when the user confirms.
  if (formData.get("confirmedName") !== parsed.data.clientName) {
    const existing = await prisma.client.findMany({ select: { name: true } });
    const near = findNearMatch(parsed.data.clientName, existing);
    if (near) return { error: `Did you mean "${near}"? Pick them from the list, or tap Save again to create "${parsed.data.clientName}" as a new client.`, confirm: parsed.data.clientName };
  }

  const job = await createJob({ ...parsed.data, createdBy: session.username });
  redirect(`/jobs/${job.id}`);
}

export async function updateJobStatusAction(jobId: number, formData: FormData) {
  const session = await requireSession();
  const status = z.enum(["ESTIMATE", "ACTIVE", "DONE", "PAID"]).parse(formData.get("status"));
  await updateJobStatus(jobId, status, session.username);
  revalidatePath(`/jobs/${jobId}`);
}

export async function addJobNoteAction(jobId: number, formData: FormData) {
  const session = await requireSession();
  const note = String(formData.get("note") ?? "").trim();
  if (note) await addJobNote(jobId, note, session.username);
  revalidatePath(`/jobs/${jobId}`);
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
  redirect(`/jobs/${jobId}`);
}

export async function createInvoiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const jobId = Number(formData.get("jobId"));
  const totalAmount = Number(formData.get("totalAmount"));
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return { error: "Enter the invoice amount." };
  const dueRaw = String(formData.get("dueDate") ?? "").trim();
  await createInvoice({ jobId, totalAmount, dueDate: dueRaw ? new Date(dueRaw) : null });
  redirect(`/jobs/${jobId}`);
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
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/invoices");
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
  redirect(`/clients/${client.id}`);
}

export async function updateClientAction(clientId: number, formData: FormData) {
  await requireSession();
  await updateClient(clientId, {
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  revalidatePath(`/clients/${clientId}`);
}
