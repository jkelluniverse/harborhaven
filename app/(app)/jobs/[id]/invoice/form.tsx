"use client";

import { useActionState } from "react";
import { createInvoiceAction } from "@/lib/actions";
import { Button, Input, Label } from "@/components/ui";

export function InvoiceForm({ jobId }: { jobId: number }) {
  const [state, formAction, pending] = useActionState(createInvoiceAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="jobId" value={jobId} />
      <div>
        <Label htmlFor="totalAmount">Amount ($)</Label>
        <Input id="totalAmount" name="totalAmount" type="number" step="0.01" min="0.01" inputMode="decimal" required />
      </div>
      <div>
        <Label htmlFor="dueDate">Due date (optional)</Label>
        <Input id="dueDate" name="dueDate" type="date" />
      </div>
      <p className="text-base text-stone-500">
        Big jobs can be billed in stages — make another invoice later for the next stage.
      </p>
      {state?.error && <p className="text-lg text-red-700">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Create invoice"}
      </Button>
    </form>
  );
}
