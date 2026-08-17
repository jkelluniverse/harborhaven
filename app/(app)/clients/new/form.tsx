"use client";

import { useActionState } from "react";
import { createClientAction } from "@/lib/actions";
import { Button, Input, Label, Textarea } from "@/components/ui";

export function NewClientForm() {
  const [state, formAction, pending] = useActionState(createClientAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required />
      </div>
      <div>
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" type="tel" />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" />
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" />
      </div>
      {state?.confirm && <input type="hidden" name="confirmedName" value={state.confirm} />}
      {state?.error && <p className="text-lg text-red-700">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save client"}
      </Button>
    </form>
  );
}
