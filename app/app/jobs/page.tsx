import Link from "next/link";
import { listJobs } from "@/lib/services/jobs";
import { Card, LinkButton, StatusBadge, JOB_TYPE_LABEL } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const jobs = await listJobs();
  const now = new Date();
  // Overdue home-watch visits float to the top; everything else keeps
  // newest-first order.
  const sorted = [...jobs].sort((a, b) => {
    const aOver = a.type === "HOME_WATCH" && a.nextVisitDue && a.nextVisitDue <= now ? 1 : 0;
    const bOver = b.type === "HOME_WATCH" && b.nextVisitDue && b.nextVisitDue <= now ? 1 : 0;
    return bOver - aOver;
  });

  return (
    <div className="flex flex-col gap-4">
      <LinkButton href="/app/jobs/new">+ New job</LinkButton>
      {sorted.length === 0 && <p className="text-center text-stone-500">No jobs yet.</p>}
      {sorted.map((job) => {
        const overdue = job.type === "HOME_WATCH" && job.nextVisitDue && job.nextVisitDue <= now;
        return (
          <Link key={job.id} href={`/app/jobs/${job.id}`}>
            <Card className={`flex min-h-12 flex-col gap-1 active:bg-stone-100 ${overdue ? "border-amber-400" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xl font-semibold">
                  {job.client.name} <span className="font-normal text-stone-400">#{job.id}</span>
                </span>
                <StatusBadge status={job.status} />
              </div>
              <p className="text-stone-700">{job.name}</p>
              <p className="text-base text-stone-500">
                {job.address} · {JOB_TYPE_LABEL[job.type]}
                {job.type === "HOME_WATCH" && job.nextVisitDue && (
                  <span className={overdue ? " font-bold text-amber-700" : ""}>
                    {" "}· Due {job.nextVisitDue.toLocaleDateString("en-US")}
                  </span>
                )}
              </p>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
