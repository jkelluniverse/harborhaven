import { notFound } from "next/navigation";
import Link from "next/link";
import { getJobDetail } from "@/lib/services/jobs";
import { getJobMoneySummary, invoiceDisplayStatus } from "@/lib/services/invoices";
import { lineItemTotal } from "@/lib/services/line-items";
import {
  updateJobStatusAction,
  addJobNoteAction,
  addExpenseToBillAction,
  removeLineItemAction,
  sendEstimateAction,
  addPermitAction,
  resendVisitReportAction,
} from "@/lib/actions";
import { Button, Card, LinkButton, StatusBadge, Textarea, JOB_TYPE_LABEL, usd } from "@/components/ui";
import { AddPermitButton } from "./permit-button";

export const dynamic = "force-dynamic";

const PILL_STYLE: Record<string, string> = {
  Draft: "bg-stone-200 text-stone-700",
  Sent: "bg-blue-100 text-blue-900",
  Partial: "bg-amber-100 text-amber-900",
  Paid: "bg-green-100 text-green-900",
  Canceled: "bg-stone-100 text-stone-400 line-through",
};

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const { id } = await params;
  const { msg } = await searchParams;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) notFound();
  const job = await getJobDetail(jobId);
  if (!job) notFound();
  const money = await getJobMoneySummary(jobId);

  const setStatus = updateJobStatusAction.bind(null, jobId);
  const addNote = addJobNoteAction.bind(null, jobId);
  const addToBill = addExpenseToBillAction.bind(null, jobId);
  const removeItem = removeLineItemAction.bind(null, jobId);
  const sendEst = sendEstimateAction.bind(null, jobId);
  const permit = addPermitAction.bind(null, jobId);

  const unbilledItems = job.lineItems.filter((li) => li.invoiceId == null);
  const billedIds = new Set(job.lineItems.filter((li) => li.invoiceId != null).map((li) => li.id));
  const unbilledExpenses = job.expenses.filter((e) => e.billable && !job.lineItems.some((li) => li.sourceExpenseId === e.id));
  const activeInvoices = job.invoices.filter((i) => i.status !== "CANCELED");

  return (
    <div className="flex flex-col gap-5">
      {msg && (
        <p className="rounded-xl bg-teal-50 p-3 text-lg text-teal-900" role="status">
          {msg}
        </p>
      )}

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

      {/* Actions: home-watch jobs lead with Log visit; everything else keeps
          the HH-02 §5 order. */}
      <div className="flex flex-col gap-3">
        {job.type === "HOME_WATCH" && (
          <LinkButton href={`/app/jobs/${job.id}/visit`}>Log visit</LinkButton>
        )}
        <LinkButton
          href={`/app/jobs/${job.id}/expense`}
          className={job.type === "HOME_WATCH" ? "bg-stone-600" : ""}
        >
          + Add expense
        </LinkButton>
        <LinkButton href={`/app/jobs/${job.id}/line-item`}>+ Add line item</LinkButton>
        <form action={sendEst} className="contents">
          <Button type="submit" className="w-full bg-teal-700">Send estimate</Button>
        </form>
        <LinkButton href={`/app/jobs/${job.id}/invoice`} className="bg-teal-700">
          Send invoice
        </LinkButton>
        {job.status !== "DONE" && job.status !== "PAID" && (
          <form action={setStatus} className="contents">
            <input type="hidden" name="status" value="DONE" />
            <Button type="submit" className="w-full bg-stone-600">Mark done</Button>
          </form>
        )}
      </div>

      {job.type === "HOME_WATCH" && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold">Visits</h2>
            {job.nextVisitDue && (
              <span className={`text-base font-semibold ${job.nextVisitDue <= new Date() ? "text-amber-700" : "text-stone-500"}`}>
                Next due {job.nextVisitDue.toLocaleDateString("en-US")}
              </span>
            )}
          </div>
          {job.visits.length === 0 && <p className="text-stone-500">No visits yet.</p>}
          <ul className="flex flex-col gap-2">
            {job.visits.map((v) => {
              const flagged = (v.checklist as { item: string; ok: boolean }[]).filter((c) => !c.ok);
              const resend = resendVisitReportAction.bind(null, v.id);
              return (
                <li key={v.id} className="border-t border-stone-100 pt-2 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{v.visitedAt.toLocaleDateString("en-US")}</span>
                    <span className={`text-base font-semibold ${flagged.length ? "text-red-700" : "text-green-700"}`}>
                      {flagged.length ? `${flagged.length} flagged` : "All OK"}
                    </span>
                  </div>
                  <p className="text-base text-stone-500">
                    {v.reportSentAt ? `Report sent ${v.reportSentAt.toLocaleDateString("en-US")}` : "Report not sent"}
                    {(v.photos as unknown[]).length ? ` · ${(v.photos as unknown[]).length} photo${(v.photos as unknown[]).length === 1 ? "" : "s"}` : ""}
                  </p>
                  <form action={resend}>
                    <button type="submit" className="min-h-12 text-base text-teal-800 underline">
                      {v.reportSentAt ? "Resend report" : "Send report"}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 text-lg font-bold">Money</h2>
        <dl className="grid grid-cols-2 gap-y-1 text-lg">
          <dt className="text-stone-600">Estimated</dt>
          <dd className="text-right font-semibold">{usd(money.estimated)}</dd>
          <dt className="text-stone-600">Billed</dt>
          <dd className="text-right font-semibold">{usd(money.billed)}</dd>
          <dt className="text-stone-600">Paid</dt>
          <dd className="text-right font-semibold">{usd(money.paid)}</dd>
          <dt className="text-stone-600">Outstanding</dt>
          <dd className="text-right font-semibold">{usd(money.outstanding)}</dd>
          <dt className="text-stone-600">Expenses</dt>
          <dd className="text-right font-semibold">{usd(money.expenses)}</dd>
          {money.hasPermit && (
            <>
              <dt className="text-stone-600">Doug&rsquo;s cut</dt>
              <dd className="text-right font-semibold">{usd(money.dougCut)}</dd>
            </>
          )}
          <dt className="border-t border-stone-200 pt-2 text-xl font-bold">Net to Chris</dt>
          <dd className="border-t border-stone-200 pt-2 text-right text-xl font-bold">{usd(money.net)}</dd>
          <dt className="text-base text-stone-500">In hand so far</dt>
          <dd className="text-right text-base text-stone-500">{usd(money.inHand)}</dd>
        </dl>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-bold">Line items</h2>
          <AddPermitButton action={permit} hasPermit={job.lineItems.some((li) => li.kind === "PERMIT")} />
        </div>
        {job.lineItems.length === 0 && (
          <p className="text-stone-500">Nothing yet. Add a line item, or a permit with one tap.</p>
        )}
        <ul className="flex flex-col gap-2">
          {job.lineItems.map((li) => (
            <li key={li.id} className="flex items-center justify-between gap-2 border-t border-stone-100 pt-2 first:border-t-0 first:pt-0">
              <div>
                <p className="font-semibold">{li.description}</p>
                <p className="text-base text-stone-500">
                  {Number(li.qty) !== 1 ? `${Number(li.qty)} × ${usd(li.unitPrice)} · ` : ""}
                  {billedIds.has(li.id) ? "On invoice" : "Not billed yet"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{usd(lineItemTotal(li))}</span>
                {!billedIds.has(li.id) && (
                  <form action={removeItem}>
                    <input type="hidden" name="lineItemId" value={li.id} />
                    <button type="submit" aria-label={`Remove ${li.description}`} className="min-h-12 min-w-12 rounded-xl text-2xl text-stone-400">
                      ×
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
        {unbilledExpenses.length > 0 && (
          <div className="mt-4 border-t border-stone-200 pt-3">
            <p className="mb-2 font-semibold text-stone-700">Expenses ready to bill</p>
            <ul className="flex flex-col gap-2">
              {unbilledExpenses.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2">
                  <span className="text-base">
                    {e.vendor || e.category || "Expense"} — {usd(e.clientPrice ?? e.cost)}
                  </span>
                  <form action={addToBill}>
                    <input type="hidden" name="expenseId" value={e.id} />
                    <Button type="submit" className="min-h-12 bg-stone-600 px-4 text-base">Add to bill</Button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-bold">Invoices</h2>
        {activeInvoices.length === 0 && job.invoices.length === 0 && (
          <p className="text-stone-500">No invoices yet.</p>
        )}
        <ul className="flex flex-col gap-2">
          {job.invoices.map((inv) => {
            const display = invoiceDisplayStatus(inv);
            return (
              <li key={inv.id}>
                <Link href={`/app/invoices/${inv.id}`} className="flex min-h-12 items-center justify-between gap-2">
                  <span className="font-semibold">{inv.stage ?? `Invoice #${inv.id}`}</span>
                  <span className="flex items-center gap-2">
                    <span>{usd(inv.totalAmount)}</span>
                    <span className={`rounded-full px-3 py-1 text-base font-semibold ${PILL_STYLE[display]}`}>
                      {display}
                    </span>
                  </span>
                </Link>
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
          <select
            name="status"
            defaultValue={job.status}
            className="min-h-12 flex-1 rounded-xl border border-stone-300 bg-white px-4 text-lg"
          >
            <option value="ESTIMATE">Estimate</option>
            <option value="ACTIVE">Active</option>
            <option value="DONE">Done</option>
            <option value="PAID">Paid</option>
          </select>
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
