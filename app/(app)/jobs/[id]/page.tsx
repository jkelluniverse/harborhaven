import { notFound } from "next/navigation";
import Link from "next/link";
import { getJobDetail } from "@/lib/services/jobs";
import { getJobMoneySummary } from "@/lib/services/invoices";
import { updateJobStatusAction, addJobNoteAction, recordPaymentAction } from "@/lib/actions";
import { Button, Card, Input, LinkButton, Select, StatusBadge, Textarea, JOB_TYPE_LABEL, usd } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) notFound();
  const job = await getJobDetail(jobId);
  if (!job) notFound();
  const money = await getJobMoneySummary(jobId);

  const setStatus = updateJobStatusAction.bind(null, jobId);
  const addNote = addJobNoteAction.bind(null, jobId);
  const pay = recordPaymentAction.bind(null, jobId);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">
            {job.client.name} <span className="font-normal text-stone-400">#{job.id}</span>
          </h1>
          <StatusBadge status={job.status} />
        </div>
        <p className="text-lg text-stone-700">{job.name}</p>
        <p className="text-base text-stone-500">
          {job.address} · {JOB_TYPE_LABEL[job.type]}
        </p>
      </div>

      <LinkButton href={`/jobs/${job.id}/expense`}>+ Add expense</LinkButton>

      <Card>
        <h2 className="mb-2 text-lg font-bold">Money</h2>
        <dl className="grid grid-cols-2 gap-y-1 text-lg">
          <dt className="text-stone-600">Billed</dt>
          <dd className="text-right font-semibold">{usd(money.billed)}</dd>
          <dt className="text-stone-600">Paid</dt>
          <dd className="text-right font-semibold">{usd(money.paid)}</dd>
          <dt className="text-stone-600">Still owed</dt>
          <dd className="text-right font-semibold">{usd(money.outstanding)}</dd>
          <dt className="text-stone-600">Expenses</dt>
          <dd className="text-right font-semibold">{usd(money.expenses)}</dd>
          <dt className="border-t border-stone-200 pt-1 text-stone-600">Net</dt>
          <dd className="border-t border-stone-200 pt-1 text-right font-bold">{usd(money.net)}</dd>
        </dl>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-bold">Invoices</h2>
          <Link href={`/jobs/${job.id}/invoice`} className="flex min-h-12 items-center font-semibold text-teal-800">
            + New invoice
          </Link>
        </div>
        {job.invoices.length === 0 && <p className="text-stone-500">No invoices yet.</p>}
        <ul className="flex flex-col gap-4">
          {job.invoices.map((inv) => {
            const invPaid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
            return (
              <li key={inv.id} className="border-t border-stone-100 pt-3 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Invoice #{inv.id}</span>
                  <StatusBadge status={inv.status} />
                </div>
                <p className="text-base text-stone-600">
                  {usd(inv.totalAmount)} · paid {usd(invPaid)}
                  {inv.dueDate ? ` · due ${inv.dueDate.toLocaleDateString("en-US")}` : ""}
                </p>
                {inv.status === "UNPAID" && (
                  <form action={pay} className="mt-2 flex flex-col gap-2">
                    <input type="hidden" name="invoiceId" value={inv.id} />
                    <div className="flex gap-2">
                      <Input name="amount" type="number" step="0.01" min="0.01" placeholder="Amount" required className="flex-1" />
                      <Select name="method" defaultValue="OTHER" className="w-36">
                        <option value="SQUARE">Square</option>
                        <option value="OTHER">Other</option>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Input name="note" placeholder="Note (e.g. check #)" className="flex-1" />
                      <Button type="submit" className="shrink-0">Record payment</Button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-bold">Expenses</h2>
        {job.expenses.length === 0 && <p className="text-stone-500">No expenses yet.</p>}
        <ul className="flex flex-col gap-3">
          {job.expenses.map((e) => (
            <li key={e.id} className="border-t border-stone-100 pt-2 first:border-t-0 first:pt-0">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{e.vendor || e.category || "Expense"}</span>
                <span className="font-semibold">{usd(e.cost)}</span>
              </div>
              <p className="text-base text-stone-600">
                {e.billable ? `Client price ${e.clientPrice != null ? usd(e.clientPrice) : "—"}` : "Not billable"}
                {e.notes ? ` · ${e.notes}` : ""}
                {e.photoUrl ? " · 📷 receipt" : ""}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-bold">Status</h2>
        <form action={setStatus} className="flex gap-2">
          <Select name="status" defaultValue={job.status} className="flex-1">
            <option value="ESTIMATE">Estimate</option>
            <option value="ACTIVE">Active</option>
            <option value="DONE">Done</option>
            <option value="PAID">Paid</option>
          </Select>
          <Button type="submit">Update</Button>
        </form>
        <ul className="mt-3 flex flex-col gap-1 text-base text-stone-500">
          {job.history.map((h) => (
            <li key={h.id}>
              {h.changedAt.toLocaleDateString("en-US")} — {h.fromStatus ? `${h.fromStatus} → ` : ""}
              {h.toStatus}
              {h.note ? ` (${h.note})` : ""}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-bold">Notes</h2>
        <form action={addNote} className="flex flex-col gap-2">
          <Textarea name="note" placeholder="Add a note…" />
          <Button type="submit">Save note</Button>
        </form>
        <ul className="mt-3 flex flex-col gap-2">
          {job.notes.map((n) => (
            <li key={n.id} className="border-t border-stone-100 pt-2">
              <p>{n.note}</p>
              <p className="text-base text-stone-500">
                {n.author} · {n.createdAt.toLocaleDateString("en-US")}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
