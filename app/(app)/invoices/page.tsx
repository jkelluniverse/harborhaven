import Link from "next/link";
import { listInvoices, invoiceDisplayStatus } from "@/lib/services/invoices";
import { Card, usd } from "@/components/ui";

export const dynamic = "force-dynamic";

const PILL_STYLE: Record<string, string> = {
  Draft: "bg-stone-200 text-stone-700",
  Sent: "bg-blue-100 text-blue-900",
  Partial: "bg-amber-100 text-amber-900",
  Paid: "bg-green-100 text-green-900",
  Canceled: "bg-stone-100 text-stone-400 line-through",
};

export default async function InvoicesPage() {
  const invoices = await listInvoices();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Invoices</h1>
      {invoices.length === 0 && <p className="text-center text-stone-500">No invoices yet.</p>}
      {invoices.map((inv) => {
        const display = invoiceDisplayStatus(inv);
        const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
        return (
          <Link key={inv.id} href={`/invoices/${inv.id}`}>
            <Card className="active:bg-stone-100">
              <div className="flex items-center justify-between">
                <span className="text-xl font-semibold">
                  {inv.job.client.name} <span className="font-normal text-stone-400">#{inv.jobId}</span>
                </span>
                <span className={`rounded-full px-3 py-1 text-base font-semibold ${PILL_STYLE[display]}`}>
                  {display}
                </span>
              </div>
              <p className="text-stone-700">
                {inv.stage ?? `Invoice #${inv.id}`} · {usd(inv.totalAmount)}
                {paid > 0 && display !== "Paid" ? ` · paid ${usd(paid)}` : ""}
              </p>
              <p className="text-base text-stone-500">
                {inv.issuedAt.toLocaleDateString("en-US")}
                {inv.dueDate ? ` · due ${inv.dueDate.toLocaleDateString("en-US")}` : ""}
              </p>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
