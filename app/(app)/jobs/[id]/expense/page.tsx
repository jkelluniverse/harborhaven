import { notFound } from "next/navigation";
import { getJobDetail } from "@/lib/services/jobs";
import { ExpenseForm } from "./form";

export const dynamic = "force-dynamic";

export default async function AddExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) notFound();
  const job = await getJobDetail(jobId);
  if (!job) notFound();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Add expense</h1>
      <p className="mb-4 text-stone-600">
        {job.client.name} #{job.id} · {job.name}
      </p>
      <ExpenseForm jobId={job.id} markup={Number(job.markup)} />
    </div>
  );
}
