import Link from "next/link";
import { listInvoices } from "@/lib/services/invoices";
import { Card, StatusBadge, usd } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const invoices = await listInvoices();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Invoices</h1>
      {invoices.length === 0 && <p className="text-center text-stone-500">No invoices yet.</p>}
      {invoices.map((inv) => {
        const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
        return (
          <Link key={inv.id} href={`/jobs/${inv.jobId}`}>
            <Card className="active:bg-stone-100">
              <div className="flex items-center justify-between">
                <span className="text-xl font-semibold">
                  {inv.job.client.name} <span className="font-normal text-stone-400">#{inv.jobId}</span>
                </span>
                <StatusBadge status={inv.status} />
              </div>
              <p className="text-stone-700">
                {usd(inv.totalAmount)} · paid {usd(paid)}
              </p>
              <p className="text-base text-stone-500">
                Invoice #{inv.id} · {inv.issuedAt.toLocaleDateString("en-US")}
                {inv.dueDate ? ` · due ${inv.dueDate.toLocaleDateString("en-US")}` : ""}
              </p>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
