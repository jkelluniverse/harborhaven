import { notFound } from "next/navigation";
import { getJobDetail } from "@/lib/services/jobs";
import { getNumberSetting } from "@/lib/services/settings";
import { LineItemForm } from "./form";

export const dynamic = "force-dynamic";

export default async function AddLineItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) notFound();
  const job = await getJobDetail(jobId);
  if (!job) notFound();
  const permitPrice = await getNumberSetting("permit_price");

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Add line item</h1>
      <p className="mb-4 text-stone-600">
        {job.client.name} #{job.id} · {job.name}
      </p>
      <LineItemForm jobId={job.id} permitPrice={permitPrice} />
    </div>
  );
}
