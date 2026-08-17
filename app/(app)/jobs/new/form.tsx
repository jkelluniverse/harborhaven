"use client";

import { useActionState } from "react";
import { createJobAction } from "@/lib/actions";
import { Button, Input, Label, Select } from "@/components/ui";

export function NewJobForm({ clientNames }: { clientNames: string[] }) {
  const [state, formAction, pending] = useActionState(createJobAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="clientName">Client</Label>
        <Input id="clientName" name="clientName" list="client-names" placeholder="Type a name" required />
        <datalist id="client-names">
          {clientNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>
      <div>
        <Label htmlFor="name">What is the job?</Label>
        <Input id="name" name="name" placeholder="e.g. Lanai enclosure permit" required />
      </div>
      <div>
        <Label htmlFor="address">Job address</Label>
        <Input id="address" name="address" required />
      </div>
      <div>
        <Label htmlFor="type">Job type</Label>
        <Select id="type" name="type" defaultValue="PROJECT">
          <option value="PERMIT_ONLY">Permit only</option>
          <option value="PROJECT">Project</option>
          <option value="OTHER">Other</option>
        </Select>
      </div>
      {state?.confirm && <input type="hidden" name="confirmedName" value={state.confirm} />}
      {state?.error && <p className="text-lg text-red-700">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save job"}
      </Button>
    </form>
  );
}
