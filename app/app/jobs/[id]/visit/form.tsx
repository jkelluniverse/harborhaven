"use client";

import { useActionState, useState } from "react";
import { logVisitAction } from "@/lib/actions";
import { Button, Input, Label, Textarea } from "@/components/ui";

interface Entry {
  item: string;
  ok: boolean;
  note: string;
}

/** Everything defaults to OK — Chris only taps what's wrong. */
export function VisitForm({ jobId, items }: { jobId: number; items: string[] }) {
  const [state, formAction, pending] = useActionState(logVisitAction, null);
  const [entries, setEntries] = useState<Entry[]>(items.map((item) => ({ item, ok: true, note: "" })));

  const toggle = (i: number) =>
    setEntries((prev) => prev.map((e, j) => (j === i ? { ...e, ok: !e.ok } : e)));
  const setNote = (i: number, note: string) =>
    setEntries((prev) => prev.map((e, j) => (j === i ? { ...e, note } : e)));

  const payload = JSON.stringify(
    entries.map((e) => ({ item: e.item, ok: e.ok, ...(e.note.trim() ? { note: e.note.trim() } : {}) })),
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="checklist" value={payload} />

      <div className="flex flex-col gap-2">
        {entries.map((e, i) => (
          <div key={e.item} className="rounded-xl border border-stone-200 bg-white">
            <button
              type="button"
              onClick={() => toggle(i)}
              className="flex min-h-12 w-full items-center justify-between px-4 text-lg"
            >
              <span className="font-semibold">{e.item}</span>
              <span className={`rounded-full px-4 py-1 font-bold ${e.ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                {e.ok ? "OK" : "Flagged"}
              </span>
            </button>
            {!e.ok && (
              <div className="px-4 pb-3">
                <Input
                  placeholder="What's wrong?"
                  value={e.note}
                  onChange={(ev) => setNote(i, ev.target.value)}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div>
        <Label htmlFor="photos">Photos</Label>
        <input
          id="photos"
          name="photos"
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="block min-h-12 w-full text-lg file:mr-3 file:min-h-12 file:rounded-xl file:border-0 file:bg-stone-200 file:px-4 file:font-semibold"
        />
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" placeholder="Anything else worth noting…" />
      </div>

      {state?.error && <p className="text-lg text-red-700">{state.error}</p>}

      <Button type="submit" name="sendReport" value="yes" disabled={pending}>
        {pending ? "Saving…" : "Save & send report"}
      </Button>
      <button
        type="submit"
        name="sendReport"
        value="no"
        disabled={pending}
        className="min-h-12 rounded-xl border border-stone-300 px-5 text-lg font-semibold text-stone-700"
      >
        Save without sending
      </button>
    </form>
  );
}
