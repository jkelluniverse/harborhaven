/**
 * SMS via Twilio's REST API (plain fetch, no SDK — same posture as Square and
 * Resend). One send(); every attempt is logged to SmsLog with its outcome.
 * When Twilio isn't configured, sends are logged as "skipped" and echoed to
 * the console (dev mode).
 *
 * NOTE: US A2P — the from number needs toll-free verification or A2P 10DLC
 * campaign registration before carriers will deliver. Jacob handles
 * registration; see KNOWN-LIMITS.md.
 */
import { prisma } from "@/lib/db";

export function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM,
  );
}

export async function sendSms(to: string, body: string): Promise<boolean> {
  const cleanTo = to.trim();
  if (!cleanTo) return false;

  if (!smsConfigured()) {
    console.warn(`[sms] Twilio not configured — would send to ${cleanTo}: ${body}`);
    await prisma.smsLog.create({ data: { to: cleanTo, body, status: "skipped" } }).catch(() => undefined);
    return false;
  }

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: cleanTo,
        From: process.env.TWILIO_FROM!,
        Body: body,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string };
    const ok = res.ok;
    await prisma.smsLog.create({
      data: {
        to: cleanTo,
        body,
        status: ok ? "sent" : "failed",
        providerSid: data.sid ?? null,
      },
    }).catch(() => undefined);
    if (!ok) console.error(`[sms] send failed status=${res.status}`);
    return ok;
  } catch {
    console.error("[sms] send error");
    await prisma.smsLog.create({ data: { to: cleanTo, body, status: "failed" } }).catch(() => undefined);
    return false;
  }
}
