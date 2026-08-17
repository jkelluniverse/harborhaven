"use client";

import { useActionState } from "react";
import { addExpenseAction } from "@/lib/actions";
import { Button, Input, Label, Select } from "@/components/ui";

export function ExpenseForm({ jobId, markup }: { jobId: number; markup: number }) {
  const [state, formAction, pending] = useActionState(addExpenseAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="jobId" value={jobId} />
      <div>
        <Label htmlFor="cost">What you paid ($)</Label>
        <Input id="cost" name="cost" type="number" step="0.01" min="0.01" inputMode="decimal" required />
      </div>
      <div>
        <Label htmlFor="clientPrice">Client price ($) — leave blank to use cost × {markup}</Label>
        <Input id="clientPrice" name="clientPrice" type="number" step="0.01" min="0" inputMode="decimal" />
      </div>
      <div>
        <Label htmlFor="vendor">Vendor</Label>
        <Input id="vendor" name="vendor" placeholder="e.g. Home Depot" />
      </div>
      <div>
        <Label htmlFor="category">Category</Label>
        <Select id="category" name="category" defaultValue="materials">
          <option value="materials">Materials</option>
          <option value="subcontractor">Subcontractor</option>
          <option value="permit">Permit</option>
          <option value="other">Other</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="photo">Receipt photo</Label>
        <input
          id="photo"
          name="photo"
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="block min-h-12 w-full text-lg file:mr-3 file:min-h-12 file:rounded-xl file:border-0 file:bg-stone-200 file:px-4 file:font-semibold"
        />
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Input id="notes" name="notes" />
      </div>
      <label className="flex min-h-12 items-center gap-3 text-lg">
        <input type="checkbox" name="billable" defaultChecked className="size-6" />
        Bill this to the client
      </label>
      {state?.error && <p className="text-lg text-red-700">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save expense"}
      </Button>
    </form>
  );
}
