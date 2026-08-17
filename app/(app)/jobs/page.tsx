import Link from "next/link";
import { listJobs } from "@/lib/services/jobs";
import { Card, LinkButton, StatusBadge, JOB_TYPE_LABEL } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const jobs = await listJobs();
  return (
    <div className="flex flex-col gap-4">
      <LinkButton href="/jobs/new">+ New job</LinkButton>
      {jobs.length === 0 && <p className="text-center text-stone-500">No jobs yet.</p>}
      {jobs.map((job) => (
        <Link key={job.id} href={`/jobs/${job.id}`}>
          <Card className="flex min-h-12 flex-col gap-1 active:bg-stone-100">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xl font-semibold">
                {job.client.name} <span className="font-normal text-stone-400">#{job.id}</span>
              </span>
              <StatusBadge status={job.status} />
            </div>
            <p className="text-stone-700">{job.name}</p>
            <p className="text-base text-stone-500">
              {job.address} · {JOB_TYPE_LABEL[job.type]}
            </p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
