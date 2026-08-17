import { listPayables, payableTotals, UNDO_WINDOW_MS } from "@/lib/services/payables";
import { markPayablePaidAction, undoPayablePaidAction } from "@/lib/actions";
import { Button, Card, Select, usd } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DougPage() {
  const [payables, totals] = await Promise.all([listPayables(), payableTotals()]);
  const now = Date.now();

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h1 className="text-2xl font-bold">What Doug is owed</h1>
        <p className="mt-2 text-5xl font-bold text-teal-900">{usd(totals.owed)}</p>
        <p className="mt-1 text-lg text-stone-500">Paid so far: {usd(totals.paid)}</p>
      </div>

      <a
        href="/app/doug/export"
        className="flex min-h-12 items-center justify-center rounded-xl border border-stone-300 px-5 text-lg font-semibold text-stone-700"
      >
        Download as spreadsheet (CSV)
      </a>

      {payables.length === 0 && (
        <p className="text-center text-stone-500">No permits yet. Add a permit on a job and it shows up here.</p>
      )}

      {payables.map((p) => {
        const undoable = p.status === "PAID" && p.paidAt && now - p.paidAt.getTime() < UNDO_WINDOW_MS;
        return (
          <Card key={p.id}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xl font-semibold">
                  {p.job.client.name} <span className="font-normal text-stone-400">#{p.jobId}</span>
                </p>
                <p className="text-base text-stone-500">
                  {p.job.address} · {p.createdAt.toLocaleDateString("en-US")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold">{usd(p.amount)}</p>
                <p className={`text-base font-semibold ${p.status === "PAID" ? "text-green-700" : "text-amber-700"}`}>
                  {p.status === "PAID" ? `Paid${p.paidVia ? ` · ${p.paidVia}` : ""}` : "Owed"}
                </p>
              </div>
            </div>
            {p.status === "OWED" && (
              <form action={markPayablePaidAction} className="mt-3 flex gap-2">
                <input type="hidden" name="payableId" value={p.id} />
                <Select name="paidVia" defaultValue="Venmo" className="flex-1">
                  <option value="Venmo">Venmo</option>
                  <option value="Zelle">Zelle</option>
                  <option value="Other">Other</option>
                </Select>
                <Button type="submit">Mark paid</Button>
              </form>
            )}
            {undoable && (
              <form action={undoPayablePaidAction} className="mt-3">
                <input type="hidden" name="payableId" value={p.id} />
                <button type="submit" className="min-h-12 text-lg text-stone-500 underline">
                  Undo (just marked paid)
                </button>
              </form>
            )}
          </Card>
        );
      })}
    </div>
  );
}
