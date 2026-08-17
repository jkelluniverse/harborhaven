"use client";

import { useActionState, useState } from "react";
import { addLineItemAction } from "@/lib/actions";
import { Button, Input, Label } from "@/components/ui";

const TEMPLATES = [
  { kind: "PERMIT", label: "Permit" },
  { kind: "MANAGEMENT_FEE", label: "Management fee" },
  { kind: "MATERIALS", label: "Materials" },
  { kind: "LABOR", label: "Labor" },
  { kind: "OTHER", label: "Other" },
] as const;

export function LineItemForm({ jobId, permitPrice }: { jobId: number; permitPrice: number }) {
  const [state, formAction, pending] = useActionState(addLineItemAction, null);
  const [kind, setKind] = useState<string>("MATERIALS");
  const [qty, setQty] = useState(1);
  const isPermit = kind === "PERMIT";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="qty" value={qty} />

      <div>
        <Label>What kind?</Label>
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.kind}
              type="button"
              onClick={() => setKind(t.kind)}
              className={`min-h-12 rounded-xl border px-3 text-lg font-semibold ${
                kind === t.kind ? "border-teal-800 bg-teal-800 text-white" : "border-stone-300 bg-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {isPermit ? (
        <p className="rounded-xl bg-teal-50 p-4 text-lg text-teal-900">
          One tap: adds the permit at ${permitPrice.toLocaleString()} and records what Doug is owed.
        </p>
      ) : (
        <>
          <div>
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" placeholder="e.g. Bathroom tile" required />
          </div>
          <div>
            <Label>How many?</Label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="min-h-12 min-w-12 rounded-xl border border-stone-300 bg-white text-2xl font-bold"
                aria-label="Fewer"
              >
                −
              </button>
              <span className="w-12 text-center text-2xl font-bold">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => q + 1)}
                className="min-h-12 min-w-12 rounded-xl border border-stone-300 bg-white text-2xl font-bold"
                aria-label="More"
              >
                +
              </button>
            </div>
          </div>
          <div>
            <Label htmlFor="unitPrice">Price each ($)</Label>
            <Input id="unitPrice" name="unitPrice" type="number" step="0.01" min="0.01" inputMode="decimal" required />
          </div>
        </>
      )}

      {isPermit && <input type="hidden" name="description" value="Permit" />}
      {isPermit && <input type="hidden" name="unitPrice" value={permitPrice} />}

      {state?.error && <p className="text-lg text-red-700">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : isPermit ? "Add permit" : "Add line item"}
      </Button>
    </form>
  );
}
