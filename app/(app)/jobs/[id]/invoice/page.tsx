import { notFound } from "next/navigation";
import { getJobDetail } from "@/lib/services/jobs";
import { lineItemTotal } from "@/lib/services/line-items";
import { InvoiceForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) notFound();
  const job = await getJobDetail(jobId);
  if (!job) notFound();

  const unbilled = job.lineItems
    .filter((li) => li.invoiceId == null)
    .map((li) => ({ id: li.id, description: li.description, total: lineItemTotal(li) }));
  const priorCount = job.invoices.filter((i) => i.status !== "CANCELED").length;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Send invoice</h1>
      <p className="mb-4 text-stone-600">
        {job.client.name} #{job.id} · {job.name}
      </p>
      <InvoiceForm jobId={job.id} unbilled={unbilled} priorCount={priorCount} />
    </div>
  );
}
