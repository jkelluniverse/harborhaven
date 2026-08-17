"use client";

import { Button } from "@/components/ui";

/** "Add permit" with a guard: a job can carry two real permits (building +
 *  electrical, say), but a double-tap shouldn't create a phantom payable —
 *  so the second one asks first. */
export function AddPermitButton({
  action,
  hasPermit,
}: {
  action: () => Promise<void>;
  hasPermit: boolean;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (hasPermit && !window.confirm("Add another permit? This job already has one.")) {
          e.preventDefault();
        }
      }}
    >
      <Button type="submit" className="min-h-12 bg-teal-700 px-4 text-base">
        + Add permit
      </Button>
    </form>
  );
}
