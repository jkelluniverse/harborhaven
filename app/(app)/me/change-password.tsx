"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/lib/actions";
import { Button, Input, Label } from "@/components/ui";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="currentPassword">Current password</Label>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </div>
      <div>
        <Label htmlFor="newPassword">New password (8+ characters)</Label>
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required />
      </div>
      {state?.error && <p className="text-lg text-red-700">{state.error}</p>}
      {state?.confirm === "done" && <p className="text-lg text-green-700">Password changed.</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
