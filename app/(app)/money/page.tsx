import Link from "next/link";
import { moneySummary } from "@/lib/services/money";
import { Card, usd } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MoneyPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const [month, year] = await Promise.all([moneySummary(monthStart), moneySummary(yearStart)]);

  const Block = ({ title, s }: { title: string; s: typeof month }) => (
    <Card>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      <dl className="flex flex-col gap-2 text-lg">
        <div className="flex justify-between">
          <dt className="text-stone-600">Money in</dt>
          <dd className="text-2xl font-bold text-green-800">{usd(s.moneyIn)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-600">Money out</dt>
          <dd className="text-2xl font-bold text-red-800">{usd(s.moneyOut)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-600">Open invoices</dt>
          <dd className="text-2xl font-bold text-stone-800">{usd(s.openInvoices)}</dd>
        </div>
      </dl>
    </Card>
  );

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Money</h1>
      <Block title="This month" s={month} />
      <Block title="This year" s={year} />

      <Link href="/invoices" className="flex min-h-12 items-center justify-center rounded-xl border border-teal-800 px-5 text-lg font-semibold text-teal-800">
        All invoices
      </Link>

      <Card>
        <h2 className="mb-2 text-lg font-bold">Download spreadsheets (CSV)</h2>
        <div className="grid grid-cols-2 gap-2">
          {["jobs", "expenses", "invoices", "payments", "payables"].map((w) => (
            <a
              key={w}
              href={`/money/export?what=${w}`}
              className="flex min-h-12 items-center justify-center rounded-xl border border-stone-300 text-lg font-semibold capitalize text-stone-700"
            >
              {w}
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
