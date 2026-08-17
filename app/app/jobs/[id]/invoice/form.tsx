"use client";

import { useActionState, useState } from "react";
import { createInvoiceAction } from "@/lib/actions";
import { Button, Input, Label } from "@/components/ui";

interface UnbilledItem {
  id: number;
  description: string;
  total: number;
}

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function InvoiceForm({
  jobId,
  unbilled,
  priorCount,
}: {
  jobId: number;
  unbilled: UnbilledItem[];
  priorCount: number;
}) {
  const [state, formAction, pending] = useActionState(createInvoiceAction, null);
  const [mode, setMode] = useState<"items" | "deposit">(unbilled.length ? "items" : "deposit");
  const [checked, setChecked] = useState<Set<number>>(new Set(unbilled.map((u) => u.id)));

  const allChecked = checked.size === unbilled.length;
  const defaultStage =
    mode === "deposit"
      ? priorCount === 0
        ? "Deposit"
        : `Progress ${priorCount}`
      : allChecked
        ? priorCount === 0
          ? "Full amount"
          : "Final"
        : priorCount === 0
          ? "Deposit"
          : `Progress ${priorCount}`;
  const selectedTotal = unbilled.filter((u) => checked.has(u.id)).reduce((s, u) => s + u.total, 0);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="mode" value={mode} />

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("items")}
          className={`min-h-12 rounded-xl border px-3 text-lg font-semibold ${
            mode === "items" ? "border-teal-800 bg-teal-800 text-white" : "border-stone-300 bg-white"
          }`}
        >
          Bill line items
        </button>
        <button
          type="button"
          onClick={() => setMode("deposit")}
          className={`min-h-12 rounded-xl border px-3 text-lg font-semibold ${
            mode === "deposit" ? "border-teal-800 bg-teal-800 text-white" : "border-stone-300 bg-white"
          }`}
        >
          Deposit / stage
        </button>
      </div>

      {mode === "items" ? (
        unbilled.length ? (
          <div className="flex flex-col gap-2">
            <Label>What goes on this invoice?</Label>
            {unbilled.map((u) => (
              <label key={u.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 text-lg">
                <input
                  type="checkbox"
                  name="lineItemIds"
                  value={u.id}
                  checked={checked.has(u.id)}
                  onChange={(e) => {
                    const next = new Set(checked);
                    if (e.target.checked) next.add(u.id);
                    else next.delete(u.id);
                    setChecked(next);
                  }}
                  className="size-6"
                />
                <span className="flex-1">{u.description}</span>
                <span className="font-semibold">{usd(u.total)}</span>
              </label>
            ))}
            <p className="text-right text-xl font-bold">Total: {usd(selectedTotal)}</p>
          </div>
        ) : (
          <p className="rounded-xl bg-amber-50 p-4 text-lg text-amber-900">
            No unbilled line items — add line items first, or switch to Deposit / stage.
          </p>
        )
      ) : (
        <div>
          <Label htmlFor="amount">Amount to bill now ($)</Label>
          <Input id="amount" name="amount" type="number" step="0.01" min="0.01" inputMode="decimal" required={mode === "deposit"} />
          <p className="mt-1 text-base text-stone-500">
            Everything else stays unbilled for the next stage.
          </p>
        </div>
      )}

      <div>
        <Label htmlFor="stage">Stage label</Label>
        <Input id="stage" name="stage" key={defaultStage} defaultValue={defaultStage} />
      </div>
      <div>
        <Label htmlFor="dueDate">Due date (optional)</Label>
        <Input id="dueDate" name="dueDate" type="date" />
      </div>

      {state?.error && <p className="text-lg text-red-700">{state.error}</p>}
      <Button type="submit" disabled={pending || (mode === "items" && checked.size === 0)}>
        {pending ? "Creating…" : "Create invoice"}
      </Button>
      <p className="text-base text-stone-500">
        Next step: the invoice opens and you tap Send — Square emails the payment link (bank transfer is free, card has a fee).
      </p>
    </form>
  );
}
