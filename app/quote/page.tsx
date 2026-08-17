import type { Metadata } from "next";
import Link from "next/link";
import { QuoteForm } from "@/components/quote-form";

export const metadata: Metadata = { title: "Request a quote" };

export default function QuotePage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-10 text-lg text-[var(--hh-ink)]">
      <Link href="/" className="text-[var(--hh-harbor-bright)] underline">← Harbor Haven Home Watch</Link>
      <h1 className="mt-4 text-2xl font-bold text-[var(--hh-harbor)]">Request a quote</h1>
      <p className="mb-5 mt-2">Tell us what you need — Chris will call you within one business day.</p>
      <QuoteForm />
    </main>
  );
}
