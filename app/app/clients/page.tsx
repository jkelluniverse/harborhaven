import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await prisma.client.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { jobs: true } } },
  });
  const leads = clients
    .filter((c) => c.status === "LEAD")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const active = clients.filter((c) => c.status === "ACTIVE");
  const archived = clients.filter((c) => c.status === "ARCHIVED");

  return (
    <div className="flex flex-col gap-4">
      <LinkButton href="/app/clients/new">+ Add client</LinkButton>

      {leads.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            Leads
            <span className="rounded-full bg-amber-500 px-3 py-0.5 text-base font-bold text-white">
              {leads.length}
            </span>
          </h2>
          {leads.map((c) => (
            <Link key={c.id} href={`/app/clients/${c.id}`}>
              <Card className="border-amber-300 bg-amber-50 active:bg-amber-100">
                <p className="text-xl font-semibold">{c.name}</p>
                <p className="text-base text-stone-700">
                  {c.serviceRequested ?? "Request"} · {c.propertyAddress ?? "no address"}
                </p>
                <p className="text-base text-stone-500">
                  {c.phone} · {c.createdAt.toLocaleDateString("en-US")}
                </p>
              </Card>
            </Link>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Clients</h2>
        {active.length === 0 && <p className="text-stone-500">No active clients yet.</p>}
        {active.map((c) => (
          <Link key={c.id} href={`/app/clients/${c.id}`}>
            <Card className="active:bg-stone-100">
              <p className="text-xl font-semibold">{c.name}</p>
              <p className="text-base text-stone-500">
                {c.phone || "no phone"} · {c._count.jobs} job{c._count.jobs === 1 ? "" : "s"}
              </p>
            </Card>
          </Link>
        ))}
      </section>

      {archived.length > 0 && (
        <details className="text-stone-500">
          <summary className="min-h-12 cursor-pointer py-3 text-lg">
            Archived ({archived.length})
          </summary>
          <div className="flex flex-col gap-2">
            {archived.map((c) => (
              <Link key={c.id} href={`/app/clients/${c.id}`} className="min-h-12 py-2 underline">
                {c.name} — {c.archiveReason ?? "archived"}
              </Link>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
