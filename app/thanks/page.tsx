import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Request received", robots: { index: false } };

export default function ThanksPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-4 text-center text-lg text-[var(--hh-ink)]">
      <h1 className="text-3xl font-bold text-[var(--hh-harbor)]">Got it.</h1>
      <p>Chris will call you within one business day.</p>
      <Link href="/" className="text-[var(--hh-harbor-bright)] underline">
        Back to the site
      </Link>
    </main>
  );
}
