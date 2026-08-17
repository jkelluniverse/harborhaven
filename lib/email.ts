/**
 * Email via Resend's REST API (plain fetch, no SDK — same posture as the
 * Square client). Optional: when RESEND_API_KEY is unset, sends are skipped
 * and the caller falls back to showing a shareable link.
 */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!emailConfigured()) {
    console.warn("[email] Resend not configured — skipping send");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM,
        to: [args.to],
        subject: args.subject,
        html: args.html,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) console.error(`[email] send failed status=${res.status}`);
    return res.ok;
  } catch {
    console.error("[email] send error");
    return false;
  }
}
