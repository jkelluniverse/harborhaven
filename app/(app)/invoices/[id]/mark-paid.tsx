"use client";

import { useActionState, useState } from "react";
import { markPaidOtherWayAction } from "@/lib/actions";
import { Button, Input, Label } from "@/components/ui";

/** The escape hatch — visually secondary to the Square path. */
export function MarkPaidOtherWay({ invoiceId }: { invoiceId: number }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(markPaidOtherWayAction, null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-12 text-lg text-stone-500 underline"
      >
        Paid another way? Record it here
      </button>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div>
        <Label htmlFor="amount">Amount received ($)</Label>
        <Input id="amount" name="amount" type="number" step="0.01" min="0.01" inputMode="decimal" required />
      </div>
      <div>
        <Label htmlFor="note">How was it paid?</Label>
        <Input id="note" name="note" placeholder="Venmo, Zelle, check #, cash…" required />
      </div>
      {state?.error && <p className="text-lg text-red-700">{state.error}</p>}
      <Button type="submit" disabled={pending} className="bg-stone-600">
        {pending ? "Recording…" : "Record payment"}
      </Button>
    </form>
  );
}
