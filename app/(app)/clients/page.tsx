import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await prisma.client.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { jobs: true } } },
  });
  return (
    <div className="flex flex-col gap-4">
      <LinkButton href="/clients/new">+ New client</LinkButton>
      {clients.length === 0 && <p className="text-center text-stone-500">No clients yet.</p>}
      {clients.map((c) => (
        <Link key={c.id} href={`/clients/${c.id}`}>
          <Card className="active:bg-stone-100">
            <p className="text-xl font-semibold">{c.name}</p>
            <p className="text-base text-stone-500">
              {c.phone || "no phone"} · {c._count.jobs} job{c._count.jobs === 1 ? "" : "s"}
            </p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
