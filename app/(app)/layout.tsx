import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <Link href="/jobs" className="text-xl font-bold text-teal-900">
          Harbor Haven
        </Link>
        <Link href="/clients" className="min-h-12 px-3 py-3 text-stone-500">
          Clients
        </Link>
      </header>
      <main className="flex-1 px-4 pb-28">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white">
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {[
            { href: "/jobs", label: "Jobs" },
            { href: "/money", label: "Money" },
            { href: "/doug", label: "Doug" },
            { href: "/me", label: "Me" },
          ].map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="flex min-h-14 items-center justify-center text-lg font-semibold text-teal-900"
            >
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
