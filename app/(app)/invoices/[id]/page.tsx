import { notFound } from "next/navigation";
import Link from "next/link";
import { getInvoiceDetail, invoiceDisplayStatus } from "@/lib/services/invoices";
import { lineItemTotal } from "@/lib/services/line-items";
import { sendInvoiceAction, cancelInvoiceAction } from "@/lib/actions";
import { Button, Card, usd } from "@/components/ui";
import { MarkPaidOtherWay } from "./mark-paid";

export const dynamic = "force-dynamic";

const PILL_STYLE: Record<string, string> = {
  Draft: "bg-stone-200 text-stone-700",
  Sent: "bg-blue-100 text-blue-900",
  Partial: "bg-amber-100 text-amber-900",
  Paid: "bg-green-100 text-green-900",
  Canceled: "bg-stone-100 text-stone-400 line-through",
};

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const { id } = await params;
  const { msg } = await searchParams;
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId)) notFound();
  const invoice = await getInvoiceDetail(invoiceId);
  if (!invoice) notFound();

  const display = invoiceDisplayStatus(invoice);
  const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  const send = sendInvoiceAction.bind(null, invoice.id);
  const cancel = cancelInvoiceAction.bind(null, invoice.id);
  const canSend = display === "Draft" && invoice.status !== "CANCELED";
  const canResend = display === "Sent" || display === "Partial";
  const canCancel = invoice.payments.length === 0 && invoice.status !== "CANCELED";

  return (
    <div className="flex flex-col gap-5">
      {msg && (
        <p className="rounded-xl bg-teal-50 p-3 text-lg text-teal-900" role="status">
          {msg}
        </p>
      )}

      <div>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">{invoice.stage ?? `Invoice #${invoice.id}`}</h1>
          <span className={`rounded-full px-3 py-1 text-base font-semibold ${PILL_STYLE[display]}`}>
            {display}
          </span>
        </div>
        <p className="text-lg text-stone-700">
          <Link href={`/jobs/${invoice.jobId}`} className="text-teal-800 underline">
            {invoice.job.client.name} #{invoice.jobId}
          </Link>{" "}
          · {invoice.job.name}
        </p>
        <p className="text-base text-stone-500">
          Created {invoice.issuedAt.toLocaleDateString("en-US")}
          {invoice.dueDate ? ` · due ${invoice.dueDate.toLocaleDateString("en-US")}` : ""}
          {invoice.sentAt ? ` · sent ${invoice.sentAt.toLocaleDateString("en-US")}` : ""}
        </p>
      </div>

      <Card>
        <dl className="grid grid-cols-2 gap-y-1 text-lg">
          <dt className="text-stone-600">Amount</dt>
          <dd className="text-right text-xl font-bold">{usd(invoice.totalAmount)}</dd>
          <dt className="text-stone-600">Paid</dt>
          <dd className="text-right font-semibold">{usd(paid)}</dd>
          <dt className="text-stone-600">Remaining</dt>
          <dd className="text-right font-semibold">{usd(Number(invoice.totalAmount) - paid)}</dd>
        </dl>
        {invoice.lineItems.length > 0 && (
          <ul className="mt-3 border-t border-stone-200 pt-2 text-base text-stone-600">
            {invoice.lineItems.map((li) => (
              <li key={li.id} className="flex justify-between">
                <span>{li.description}</span>
                <span>{usd(lineItemTotal(li))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {invoice.publicUrl && (
        <a
          href={invoice.publicUrl}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-12 items-center justify-center rounded-xl border border-teal-800 px-5 text-lg font-semibold text-teal-800"
        >
          Open the Square payment page
        </a>
      )}

      {(canSend || canResend) && (
        <form action={send} className="contents">
          <Button type="submit" className="w-full">
            {canResend ? "Resend via Square" : "Send via Square"}
          </Button>
        </form>
      )}

      {invoice.status !== "CANCELED" && invoice.status !== "PAID" && (
        <MarkPaidOtherWay invoiceId={invoice.id} />
      )}

      {invoice.payments.length > 0 && (
        <Card>
          <h2 className="mb-2 text-lg font-bold">Payments</h2>
          <ul className="flex flex-col gap-1 text-base">
            {invoice.payments.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>
                  {p.receivedAt.toLocaleDateString("en-US")} · {p.method === "SQUARE" ? "Square" : p.note || "Other"}
                  {p.feeAmount ? ` (fee ${usd(p.feeAmount)})` : ""}
                </span>
                <span className="font-semibold">{usd(p.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {canCancel && (
        <form action={cancel} className="contents">
          <button
            type="submit"
            className="min-h-12 rounded-xl border border-red-300 px-5 text-lg font-semibold text-red-700"
          >
            Cancel this invoice
          </button>
        </form>
      )}
    </div>
  );
}
