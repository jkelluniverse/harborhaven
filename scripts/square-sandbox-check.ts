/**
 * Manual Square sandbox credential check (run before any deploy that touches
 * Square): creates a throwaway customer + order + invoice in the SANDBOX,
 * publishes it, then cancels it. Proves token, environment, location, and the
 * invoice lifecycle end to end without sending anything to a real person.
 *
 *   DATABASE_URL=... SQUARE_ACCESS_TOKEN=... SQUARE_ENVIRONMENT=sandbox \
 *     npx tsx scripts/square-sandbox-check.ts
 */
import {
  squareConfigured,
  listLocations,
  resolveLocationId,
  createAndPublishInvoice,
  cancelSquareInvoice,
} from "../lib/square";
import { prisma } from "../lib/db";

async function main() {
  if (process.env.SQUARE_ENVIRONMENT === "production") {
    throw new Error("Refusing to run against production. Set SQUARE_ENVIRONMENT=sandbox.");
  }
  if (!squareConfigured()) {
    throw new Error("SQUARE_ACCESS_TOKEN is not set.");
  }

  console.log("1) Locations…");
  const locations = await listLocations();
  if (!locations.length) throw new Error("No locations — token invalid or wrong environment?");
  console.log(`   ok: ${locations.map((l) => `${l.id} (${l.name ?? "?"}, ${l.status ?? "?"})`).join(", ")}`);

  const locationId = await resolveLocationId();
  console.log(`2) Location resolved: ${locationId}`);

  // A sandbox customer, created inline (not via a real Client row).
  console.log("3) Sandbox customer…");
  const custRes = await fetch(
    `https://connect.squareupsandbox.com/v2/customers`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Square-Version": "2024-06-04",
      },
      body: JSON.stringify({
        idempotency_key: `hh-sandbox-check-${Date.now()}`,
        given_name: "Sandbox",
        family_name: "Check",
        email_address: "sandbox-check@example.com",
      }),
    },
  );
  if (!custRes.ok) throw new Error(`customer create failed: ${custRes.status} ${await custRes.text()}`);
  const customer = ((await custRes.json()) as { customer: { id: string } }).customer;
  console.log(`   ok: customer ${customer.id}`);

  console.log("4) Create + publish a test invoice…");
  const stamp = Date.now();
  const result = await createAndPublishInvoice({
    localInvoiceId: stamp, // throwaway idempotency scope for this check
    squareCustomerId: customer.id,
    title: "Harbor Haven sandbox check (ignore)",
    lineItems: [{ name: "Sandbox check item", qty: "1", amountCents: 100 }],
  });
  if (!result.ok) throw new Error(`invoice failed at: ${result.error}`);
  console.log(`   ok: invoice ${result.squareInvoiceId}`);
  console.log(`   public url: ${result.publicUrl ?? "(none yet)"}`);

  console.log("5) Cancel it again…");
  const canceled = await cancelSquareInvoice(result.squareInvoiceId);
  if (!canceled) throw new Error("cancel failed");
  console.log("   ok: canceled");

  console.log("\nAll good — sandbox credentials and the invoice lifecycle work.");
}

main()
  .catch((e) => {
    console.error(String(e));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
