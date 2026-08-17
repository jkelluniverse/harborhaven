import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  updateClientAction,
  startEstimateAction,
  archiveLeadAction,
  appendLeadNoteAction,
} from "@/lib/actions";
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
  const start = startEstimateAction.bind(null, client.id);
  const archive = archiveLeadAction.bind(null, client.id);
  const appendNote = appendLeadNoteAction.bind(null, client.id);
  const isLead = client.status === "LEAD";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">{client.name}</h1>
        <p className="text-base text-stone-500">
          {isLead ? "Lead" : client.status === "ARCHIVED" ? `Archived — ${client.archiveReason ?? ""}` : "Client"}
          {" · "}via {client.source.toLowerCase()}
        </p>
      </div>

      {isLead && (
        <>
          <Card className="border-amber-300 bg-amber-50">
            <h2 className="mb-2 text-lg font-bold">What they asked for</h2>
            <dl className="flex flex-col gap-1 text-lg">
              <div><dt className="inline font-semibold">Service: </dt><dd className="inline">{client.serviceRequested ?? "—"}</dd></div>
              <div><dt className="inline font-semibold">Address: </dt><dd className="inline">{client.propertyAddress ?? "—"}</dd></div>
              <div><dt className="inline font-semibold">Phone: </dt><dd className="inline"><a href={`tel:${client.phone}`} className="text-teal-800 underline">{client.phone}</a></dd></div>
              {client.email && <div><dt className="inline font-semibold">Email: </dt><dd className="inline">{client.email}</dd></div>}
              {client.preferredDates && <div><dt className="inline font-semibold">When: </dt><dd className="inline">{client.preferredDates}</dd></div>}
            </dl>
          </Card>

          <form action={start} className="contents">
            <Button type="submit" className="w-full">Start estimate</Button>
          </form>

          <details>
            <summary className="min-h-12 cursor-pointer py-3 text-lg text-stone-500">Not a fit?</summary>
            <form action={archive} className="flex gap-2">
              <Input name="reason" placeholder="One-line reason" className="flex-1" />
              <Button type="submit" className="bg-stone-600">Archive</Button>
            </form>
          </details>
        </>
      )}

      {client.leadNotes && (
        <Card>
          <h2 className="mb-2 text-lg font-bold">Request history</h2>
          <p className="whitespace-pre-wrap text-base text-stone-700">{client.leadNotes}</p>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 text-lg font-bold">Add a note</h2>
        <form action={appendNote} className="flex flex-col gap-2">
          <Textarea name="note" placeholder="What did they say?" />
          <Button type="submit">Save</Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-bold">Jobs</h2>
        {client.jobs.length === 0 && <p className="text-stone-500">No jobs yet.</p>}
        <ul className="flex flex-col gap-2">
          {client.jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/app/jobs/${j.id}`} className="flex min-h-12 items-center justify-between">
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
