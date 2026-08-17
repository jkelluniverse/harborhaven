import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { updateClientAction } from "@/lib/actions";
import { Button, Card, Input, Label, StatusBadge, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clientId = Number(id);
  if (!Number.isInteger(clientId)) notFound();
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { jobs: { orderBy: { createdAt: "desc" } } },
  });
  if (!client) notFound();

  const save = updateClientAction.bind(null, client.id);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">{client.name}</h1>

      <Card>
        <h2 className="mb-2 text-lg font-bold">Jobs</h2>
        {client.jobs.length === 0 && <p className="text-stone-500">No jobs yet.</p>}
        <ul className="flex flex-col gap-2">
          {client.jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/jobs/${j.id}`} className="flex min-h-12 items-center justify-between">
                <span className="font-semibold">
                  #{j.id} {j.name}
                </span>
                <StatusBadge status={j.status} />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-bold">Contact</h2>
        <form action={save} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" type="tel" defaultValue={client.phone ?? ""} />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={client.email ?? ""} />
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={client.notes ?? ""} />
          </div>
          <Button type="submit">Save</Button>
        </form>
      </Card>
    </div>
  );
}
