"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/actions";
import { Button, Input, Label } from "@/components/ui";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, null);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-teal-900">Harbor Haven</h1>
        <p className="mt-1 text-lg text-stone-600">Home Watch</p>
      </div>
      <form action={formAction} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="username">Username</Label>
          <Input id="username" name="username" autoComplete="username" autoCapitalize="none" required />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {state?.error && <p className="text-lg text-red-700">{state.error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
