"use client";

import { useActionState } from "react";
import { addClientLeadAction } from "@/lib/actions";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";

/** Manual add — writes the same lead-shaped record as the website form. */
export function NewClientForm() {
  const [state, formAction, pending] = useActionState(addClientLeadAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="name">Name *</Label>
        <Input id="name" name="name" required />
      </div>
      <div>
        <Label htmlFor="phone">Phone *</Label>
        <Input id="phone" name="phone" type="tel" required />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" />
      </div>
      <div>
        <Label htmlFor="propertyAddress">Property address</Label>
        <Input id="propertyAddress" name="propertyAddress" />
      </div>
      <div>
        <Label htmlFor="serviceRequested">What do they need?</Label>
        <Select id="serviceRequested" name="serviceRequested" defaultValue="Something else">
          <option>Home Watch</option>
          <option>Permit only</option>
          <option>Project</option>
          <option>Something else</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="source">How did they reach you?</Label>
        <Select id="source" name="source" defaultValue="PHONE">
          <option value="PHONE">Phone</option>
          <option value="REFERRAL">Referral</option>
          <option value="WEBSITE">Website</option>
          <option value="OTHER">Other</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="details">Notes</Label>
        <Textarea id="details" name="details" />
      </div>
      {state?.error && <p className="text-lg text-red-700">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save client"}
      </Button>
    </form>
  );
}
