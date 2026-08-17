import { notFound } from "next/navigation";
import { getEstimateByToken } from "@/lib/services/estimates";
import { lineItemTotal } from "@/lib/services/line-items";

export const dynamic = "force-dynamic";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Public, read-only estimate page. No payment here — invoices go through
 *  Square. Reachable only by unguessable token. */
export default async function PublicEstimatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const job = await getEstimateByToken(token);
  if (!job) notFound();
  const total = job.lineItems.reduce((s, li) => s + lineItemTotal(li), 0);

  return (
    <main className="mx-auto max-w-lg p-6">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-teal-900">Harbor Haven Home Watch</h1>
        <p className="mt-1 text-lg text-stone-600">Estimate</p>
      </header>

      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-xl font-semibold">{job.name}</p>
        <p className="text-lg text-stone-600">{job.address}</p>
        <p className="mt-1 text-base text-stone-500">
          Prepared for {job.client.name}
          {job.estimateSentAt ? ` · ${job.estimateSentAt.toLocaleDateString("en-US")}` : ""}
        </p>

        <table className="mt-5 w-full text-lg">
          <tbody>
            {job.lineItems.map((li) => (
              <tr key={li.id} className="border-t border-stone-100">
                <td className="py-2 pr-3">
                  {li.description}
                  {Number(li.qty) !== 1 ? (
                    <span className="text-stone-500"> × {Number(li.qty)}</span>
                  ) : null}
                </td>
                <td className="py-2 text-right font-semibold">{usd(lineItemTotal(li))}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-stone-300">
              <td className="py-3 text-xl font-bold">Total</td>
              <td className="py-3 text-right text-xl font-bold">{usd(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-center text-lg text-stone-600">
        Questions? Call or text Chris — this estimate is not a bill; nothing is
        due until you receive an invoice.
      </p>
    </main>
  );
}
