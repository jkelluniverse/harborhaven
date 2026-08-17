/**
 * Square, via plain REST (no SDK dependency). Pattern copied from the Kell
 * Systems house implementation and renamed for Harbor Haven; nothing is
 * imported from other projects at runtime.
 *
 * Harbor Haven is ONE business with ONE Square account, configured entirely
 * by env var — no OAuth, no token vault, no multi-merchant anything:
 *   SQUARE_ACCESS_TOKEN            access token (sandbox or production)
 *   SQUARE_ENVIRONMENT             "sandbox" (default) | "production"
 *   SQUARE_LOCATION_ID             the business location (discovered+cached
 *                                  in app-settings when unset)
 *   SQUARE_WEBHOOK_SIGNATURE_KEY   webhook subscription signature key
 *
 * Square owns money movement, the hosted invoice page, and the PCI surface.
 * We hold only ids and statuses. Logs carry metadata (ids, event types) —
 * never amounts.
 */
import { createHmac, createHash } from "crypto";
import { prisma } from "@/lib/db";

const SQUARE_VERSION = "2024-06-04";

function isProduction(): boolean {
  return process.env.SQUARE_ENVIRONMENT === "production";
}

export function squareConfigured(): boolean {
  return Boolean(process.env.SQUARE_ACCESS_TOKEN);
}

function baseUrl(): string {
  return isProduction()
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

/** Deterministic idempotency key for a mutating call: same logical operation
 *  → same key → Square dedupes retries. Namespaced to Harbor Haven. */
export function idempotencyKey(operation: string, localId: string | number): string {
  return `hh-${operation}-${localId}`;
}

async function squareFetch(
  path: string,
  body?: object,
  method: "GET" | "POST" | "PUT" = body ? "POST" : "GET",
): Promise<Response> {
  return fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
}

// ---------------------------------------------------------------------------
// Location: env wins; otherwise discovered once from the account and cached
// in app-settings ("square_location_id").

let locationCache: string | null = null;

export async function resolveLocationId(): Promise<string | null> {
  if (process.env.SQUARE_LOCATION_ID) return process.env.SQUARE_LOCATION_ID;
  if (locationCache) return locationCache;
  if (!squareConfigured()) return null;
  try {
    const stored = await prisma.appSetting.findUnique({ where: { key: "square_location_id" } });
    if (stored?.value) {
      locationCache = stored.value;
      return stored.value;
    }
    const res = await squareFetch("/v2/locations");
    if (!res.ok) {
      console.error(`[square] locations fetch failed status=${res.status}`);
      return null;
    }
    const data = (await res.json()) as { locations?: { id: string; status?: string }[] };
    const loc = data.locations?.find((l) => l.status === "ACTIVE") ?? data.locations?.[0];
    if (!loc) return null;
    locationCache = loc.id;
    await prisma.appSetting.upsert({
      where: { key: "square_location_id" },
      update: { value: loc.id },
      create: { key: "square_location_id", value: loc.id },
    });
    return loc.id;
  } catch {
    console.error("[square] location resolution error");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Customers — idempotent upsert keyed on our client id (reference_id).
// Adopt-don't-twin: an existing Square customer with the same reference or an
// unambiguous email match is claimed rather than duplicated.

function splitName(name: string): { given?: string; family?: string } {
  const parts = name.trim().split(/\s+/);
  return { given: parts[0], family: parts.slice(1).join(" ") || undefined };
}

async function findCustomerByReference(referenceId: string): Promise<string | null> {
  const res = await squareFetch("/v2/customers/search", {
    query: { filter: { reference_id: { exact: referenceId } } },
    limit: 1,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { customers?: { id: string }[] };
  return data.customers?.[0]?.id ?? null;
}

async function adoptCustomerByEmail(email: string, referenceId: string): Promise<string | null> {
  const res = await squareFetch("/v2/customers/search", {
    query: { filter: { email_address: { exact: email } } },
    limit: 2,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { customers?: { id: string; reference_id?: string }[] };
  const matches = (data.customers ?? []).filter(
    (c) => !c.reference_id || c.reference_id === referenceId,
  );
  if (matches.length !== 1) return null; // ambiguous or someone else's — create fresh
  const found = matches[0];
  if (found.reference_id !== referenceId) {
    await squareFetch(`/v2/customers/${found.id}`, { reference_id: referenceId }, "PUT").catch(
      () => undefined,
    );
  }
  return found.id;
}

/** Upsert the Square Customer for a local Client and persist the link.
 *  Returns the Square customer id, or null when Square is unreachable. */
export async function ensureSquareCustomer(clientId: number): Promise<string | null> {
  if (!squareConfigured()) return null;
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  if (client.squareCustomerId) return client.squareCustomerId;
  if (!client.email) return null; // Square invoices need a recipient email

  const referenceId = `hh-client-${client.id}`;
  const { given, family } = splitName(client.name);
  try {
    let squareId =
      (await findCustomerByReference(referenceId)) ??
      (await adoptCustomerByEmail(client.email, referenceId));
    if (squareId) {
      await squareFetch(`/v2/customers/${squareId}`, {
        given_name: given,
        family_name: family,
        email_address: client.email,
        ...(client.phone ? { phone_number: client.phone } : {}),
      }, "PUT").catch(() => undefined);
    } else {
      const res = await squareFetch("/v2/customers", {
        idempotency_key: idempotencyKey("cust", client.id),
        given_name: given,
        family_name: family,
        email_address: client.email,
        ...(client.phone ? { phone_number: client.phone } : {}),
        reference_id: referenceId,
      });
      if (!res.ok) {
        console.error(`[square] customer create failed client=${client.id} status=${res.status}`);
        return null;
      }
      const data = (await res.json()) as { customer?: { id: string } };
      squareId = data.customer?.id ?? null;
    }
    if (squareId) {
      await prisma.client.update({ where: { id: client.id }, data: { squareCustomerId: squareId } });
    }
    return squareId;
  } catch {
    console.error(`[square] customer upsert error client=${client.id}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Invoices — order from line items, invoice with EMAIL delivery (Square sends
// the email; ACH + card enabled), publish. The order's reference_id carries
// our invoice id so a payment can always be traced back.

export interface SquareLineItem {
  name: string;
  qty: string; // decimal string, e.g. "1" or "2.5"
  amountCents: number; // unit price in cents
}

export type SendInvoiceResult =
  | { ok: true; squareInvoiceId: string; squareOrderId: string; publicUrl: string | null; status: string | null }
  | { ok: false; error: string };

export async function createAndPublishInvoice(args: {
  localInvoiceId: number;
  squareCustomerId: string;
  title: string;
  lineItems: SquareLineItem[];
  dueDate?: string | null; // YYYY-MM-DD
}): Promise<SendInvoiceResult> {
  if (!squareConfigured()) return { ok: false, error: "Square is not configured" };
  const locationId = await resolveLocationId();
  if (!locationId) return { ok: false, error: "No Square location" };
  try {
    const orderRes = await squareFetch("/v2/orders", {
      idempotency_key: idempotencyKey("ord", args.localInvoiceId),
      order: {
        location_id: locationId,
        reference_id: `hh-inv-${args.localInvoiceId}`,
        line_items: args.lineItems.map((li) => ({
          name: li.name,
          quantity: li.qty,
          base_price_money: { amount: li.amountCents, currency: "USD" },
        })),
      },
    });
    if (!orderRes.ok) {
      console.error(`[square] order create failed inv=${args.localInvoiceId} status=${orderRes.status}`);
      return { ok: false, error: "Square order failed" };
    }
    const orderData = (await orderRes.json()) as { order?: { id: string } };
    if (!orderData.order?.id) return { ok: false, error: "Square order failed" };

    const invoiceRes = await squareFetch("/v2/invoices", {
      idempotency_key: idempotencyKey("inv", args.localInvoiceId),
      invoice: {
        location_id: locationId,
        order_id: orderData.order.id,
        primary_recipient: { customer_id: args.squareCustomerId },
        delivery_method: "EMAIL",
        title: args.title,
        payment_requests: [
          {
            request_type: "BALANCE",
            due_date: args.dueDate ?? new Date().toISOString().slice(0, 10),
            automatic_payment_source: "NONE",
          },
        ],
        // ACH is free to the client; card carries Square's fee.
        accepted_payment_methods: { card: true, bank_account: true },
      },
    });
    if (!invoiceRes.ok) {
      const text = await invoiceRes.text().catch(() => "");
      console.error(`[square] invoice create failed inv=${args.localInvoiceId} status=${invoiceRes.status} ${text.slice(0, 200)}`);
      return { ok: false, error: "Square invoice failed" };
    }
    const invData = (await invoiceRes.json()) as { invoice?: { id: string; version: number } };
    if (!invData.invoice) return { ok: false, error: "Square invoice failed" };

    const pubRes = await squareFetch(`/v2/invoices/${invData.invoice.id}/publish`, {
      idempotency_key: idempotencyKey("pub", args.localInvoiceId),
      version: invData.invoice.version,
    });
    if (!pubRes.ok) {
      console.error(`[square] invoice publish failed inv=${args.localInvoiceId} status=${pubRes.status}`);
      return { ok: false, error: "Square publish failed" };
    }
    const pubData = (await pubRes.json()) as {
      invoice?: { id: string; public_url?: string; status?: string };
    };
    console.log(`[square] invoice published local=${args.localInvoiceId} square=${invData.invoice.id}`);
    return {
      ok: true,
      squareInvoiceId: invData.invoice.id,
      squareOrderId: orderData.order.id,
      publicUrl: pubData.invoice?.public_url ?? null,
      status: pubData.invoice?.status ?? null,
    };
  } catch {
    console.error(`[square] invoice send error inv=${args.localInvoiceId}`);
    return { ok: false, error: "Square unreachable" };
  }
}

/** Cancel an open Square invoice. Terminal states count as already done. */
export async function cancelSquareInvoice(squareInvoiceId: string): Promise<boolean> {
  if (!squareConfigured()) return false;
  try {
    const get = await squareFetch(`/v2/invoices/${squareInvoiceId}`);
    if (!get.ok) return false;
    const data = (await get.json()) as { invoice?: { version?: number; status?: string } };
    const inv = data.invoice;
    if (!inv) return false;
    if (["PAID", "CANCELED", "REFUNDED", "FAILED"].includes(inv.status ?? "")) return true;
    const res = await squareFetch(`/v2/invoices/${squareInvoiceId}/cancel`, {
      version: inv.version ?? 0,
    });
    if (res.ok) console.log(`[square] invoice canceled id=${squareInvoiceId}`);
    return res.ok;
  } catch {
    console.error(`[square] invoice cancel error id=${squareInvoiceId}`);
    return false;
  }
}

/** Trace a Square payment to its order (for payments whose order id isn't in
 *  the webhook payload). */
export async function getPaymentOrderId(paymentId: string): Promise<string | null> {
  if (!squareConfigured()) return null;
  try {
    const res = await squareFetch(`/v2/payments/${paymentId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { payment?: { order_id?: string } };
    return data.payment?.order_id ?? null;
  } catch {
    return null;
  }
}

export async function listLocations(): Promise<{ id: string; name?: string; status?: string }[]> {
  if (!squareConfigured()) return [];
  const res = await squareFetch("/v2/locations");
  if (!res.ok) return [];
  const data = (await res.json()) as { locations?: { id: string; name?: string; status?: string }[] };
  return data.locations ?? [];
}

// ---------------------------------------------------------------------------
// Webhook signature (Square v2): base64(HMAC-SHA256(key, notificationUrl +
// rawBody)) must equal x-square-hmacsha256-signature. Constant-time compare.

export function verifySquareSignature(
  rawBody: string,
  signatureHeader: string | null,
  notificationUrl: string,
): boolean {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key || !signatureHeader) return false;
  const expected = createHmac("sha256", key).update(notificationUrl + rawBody).digest("base64");
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(signatureHeader).digest();
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
