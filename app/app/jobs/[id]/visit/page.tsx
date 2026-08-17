import { notFound } from "next/navigation";
import { getJobDetail } from "@/lib/services/jobs";
import { DEFAULT_CHECKLIST } from "@/lib/services/visits";
import { VisitForm } from "./form";

export const dynamic = "force-dynamic";

export default async function LogVisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) notFound();
  const job = await getJobDetail(jobId);
  if (!job || job.type !== "HOME_WATCH") notFound();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Log visit</h1>
      <p className="mb-4 text-stone-600">
        {job.client.name} #{job.id} · {job.address}
      </p>
      <VisitForm jobId={job.id} items={[...DEFAULT_CHECKLIST]} />
    </div>
  );
}
