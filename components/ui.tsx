/* Minimal UI kit, Jitterbug-sized: every control ≥48px tall, text ≥18px. */
import Link from "next/link";
import type { ComponentProps } from "react";

export function Button({ className = "", ...props }: ComponentProps<"button">) {
  return (
    <button
      className={`min-h-12 rounded-xl bg-teal-800 px-5 text-lg font-semibold text-white active:bg-teal-900 disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export function LinkButton({ className = "", ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={`flex min-h-12 items-center justify-center rounded-xl bg-teal-800 px-5 text-lg font-semibold text-white active:bg-teal-900 ${className}`}
      {...props}
    />
  );
}

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      className={`min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 text-lg ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return (
    <select
      className={`min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 text-lg ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={`min-h-24 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-lg ${className}`}
      {...props}
    />
  );
}

export function Label({ className = "", ...props }: ComponentProps<"label">) {
  return <label className={`mb-1 block font-medium text-stone-700 ${className}`} {...props} />;
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-2xl border border-stone-200 bg-white p-4 ${className}`} {...props} />;
}

const STATUS_STYLE: Record<string, string> = {
  ESTIMATE: "bg-amber-100 text-amber-900",
  ACTIVE: "bg-blue-100 text-blue-900",
  DONE: "bg-violet-100 text-violet-900",
  PAID: "bg-green-100 text-green-900",
  UNPAID: "bg-amber-100 text-amber-900",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-3 py-1 text-base font-semibold ${STATUS_STYLE[status] ?? "bg-stone-100 text-stone-700"}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

export const JOB_TYPE_LABEL: Record<string, string> = {
  PERMIT_ONLY: "Permit only",
  PROJECT: "Project",
  OTHER: "Other",
};

export function usd(n: number | string | { toString(): string }): string {
  return Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
