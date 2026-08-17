import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { createLeadOrAppend } from "@/lib/services/leads";
import { sendSms } from "@/lib/sms";
import { sendEmail, emailConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";

const leadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  propertyAddress: z.string().trim().min(1).max(300),
  serviceRequested: z.enum(["Home Watch", "Permit only", "Project", "Something else"]),
  details: z.string().trim().max(2000).optional(),
  preferredDates: z.string().trim().max(200).optional(),
});

// Simple in-memory rate limit: 5 submissions per IP per hour. Resets on
// deploy/restart and is per-instance — fine for one small site (KNOWN-LIMITS).
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  return false;
}

export async function POST(req: Request) {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();

  const contentType = req.headers.get("content-type") ?? "";
  let raw: Record<string, unknown>;
  if (contentType.includes("application/json")) {
    raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } else {
    const form = await req.formData().catch(() => null);
    raw = form ? Object.fromEntries(form.entries()) : {};
  }

  const redirectToThanks = () =>
    NextResponse.redirect(new URL("/thanks", req.url), { status: 303 });

  // Honeypot: bots fill "company"; humans never see it. Pretend success.
  if (typeof raw.company === "string" && raw.company.trim() !== "") {
    return redirectToThanks();
  }

  if (rateLimited(ip)) {
    return new NextResponse("Too many requests — please call instead.", { status: 429 });
  }

  const parsed = leadSchema.safeParse(raw);
  if (!parsed.success) {
    return new NextResponse("Please go back and fill in the required fields.", { status: 400 });
  }
  const lead = parsed.data;

  const { client, isNew } = await createLeadOrAppend({
    name: lead.name,
    phone: lead.phone,
    email: lead.email || null,
    propertyAddress: lead.propertyAddress,
    serviceRequested: lead.serviceRequested,
    details: lead.details || null,
    preferredDates: lead.preferredDates || null,
    source: "WEBSITE",
  });

  // Notify Chris — SMS first, email as backup. Failures never block the lead.
  const appUrl = `https://harborhavenhomewatch.com/app/clients/${client.id}`;
  const summary = `${isNew ? "New lead" : "New request (existing client)"}: ${lead.name}, ${lead.propertyAddress}, ${lead.serviceRequested} — open in app ${appUrl}`;
  const ownerPhone = process.env.OWNER_PHONE;
  if (ownerPhone) void sendSms(ownerPhone, summary).catch(() => undefined);
  if (emailConfigured() && process.env.RESEND_FROM) {
    void sendEmail({
      to: process.env.RESEND_FROM.replace(/^.*<|>$/g, ""),
      subject: summary.slice(0, 100),
      html: `<p>${summary}</p><p><a href="${appUrl}">Open the lead</a></p>${lead.details ? `<p>"${lead.details}"</p>` : ""}`,
    }).catch(() => undefined);
  }

  // Plain confirmation to the lead, when they gave an email.
  if (lead.email) {
    void sendEmail({
      to: lead.email,
      subject: "Got your request — Harbor Haven Home Watch",
      html: `<div style="font-family:Georgia,serif;font-size:18px;color:#22303a;max-width:480px;">
        <p>Hi ${lead.name.split(" ")[0]},</p>
        <p>Got your request about <strong>${lead.serviceRequested}</strong> at ${lead.propertyAddress}. Chris will call you within one business day.</p>
        <p>If it's urgent, call <a href="tel:+19419612252">(941) 961-2252</a>.</p>
        <p>— Harbor Haven Home Watch</p>
      </div>`,
    }).catch(() => undefined);
  }

  return redirectToThanks();
}
