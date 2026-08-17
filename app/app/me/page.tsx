import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { logoutAction } from "@/lib/actions";
import { Card } from "@/components/ui";
import { ChangePasswordForm } from "./change-password";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Hi, {session.name}</h1>

      <Card>
        <h2 className="mb-3 text-lg font-bold">Change my password</h2>
        <ChangePasswordForm />
      </Card>

      <form action={logoutAction}>
        <button
          type="submit"
          className="min-h-12 w-full rounded-xl border border-stone-300 px-5 text-lg font-semibold text-stone-700"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
