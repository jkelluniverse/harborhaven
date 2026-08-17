/**
 * Estimates: our own simple document — a read-only public page at
 * /e/[token] listing the job's line items, emailed via Resend. No payment on
 * estimates; Square handles invoices only. SMS link delivery is HH-03.
 */
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { sendEmail, emailConfigured } from "@/lib/email";
import { lineItemTotal } from "./line-items";

export async function ensureEstimateToken(jobId: number): Promise<string> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  if (job.estimateToken) return job.estimateToken;
  const token = randomBytes(16).toString("base64url");
  await prisma.job.update({ where: { id: jobId }, data: { estimateToken: token } });
  return token;
}

export async function getEstimateByToken(token: string) {
  return prisma.job.findUnique({
    where: { estimateToken: token },
    include: { client: true, lineItems: { orderBy: { createdAt: "asc" } } },
  });
}

export type SendEstimateResult =
  | { ok: true; emailed: boolean; url: string }
  | { ok: false; error: string };

export async function sendEstimate(jobId: number, appBaseUrl: string): Promise<SendEstimateResult> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { client: true, lineItems: true },
  });
  if (job.lineItems.length === 0) {
    return { ok: false, error: "Add at least one line item before sending an estimate." };
  }
  const token = await ensureEstimateToken(jobId);
  const url = `${appBaseUrl.replace(/\/$/, "")}/e/${token}`;

  let emailed = false;
  if (job.client.email && emailConfigured()) {
    const total = job.lineItems.reduce((s, li) => s + lineItemTotal(li), 0);
    const usd = (n: number) =>
      n.toLocaleString("en-US", { style: "currency", currency: "USD" });
    const rows = job.lineItems
      .map(
        (li) =>
          `<tr><td style="padding:6px 12px 6px 0;">${li.description}</td><td style="padding:6px 0;text-align:right;">${usd(lineItemTotal(li))}</td></tr>`,
      )
      .join("");
    emailed = await sendEmail({
      to: job.client.email,
      subject: `Estimate — ${job.name}`,
      html: `
        <div style="font-family:Georgia,serif;font-size:18px;color:#1c1917;max-width:480px;">
          <h2 style="color:#115e59;">Harbor Haven Home Watch</h2>
          <p>Hi ${job.client.name.split(" ")[0]},</p>
          <p>Here's the estimate for <strong>${job.name}</strong> at ${job.address}:</p>
          <table style="width:100%;border-collapse:collapse;font-size:18px;">${rows}
            <tr><td style="padding:10px 12px 0 0;border-top:1px solid #d6d3d1;"><strong>Total</strong></td>
            <td style="padding:10px 0 0;border-top:1px solid #d6d3d1;text-align:right;"><strong>${usd(total)}</strong></td></tr>
          </table>
          <p style="margin-top:20px;"><a href="${url}" style="color:#115e59;">View this estimate online</a></p>
          <p>Questions? Just reply to this email or give me a call.</p>
          <p>— Chris</p>
        </div>`,
    });
  }
  await prisma.job.update({ where: { id: jobId }, data: { estimateSentAt: new Date() } });
  return { ok: true, emailed, url };
}
