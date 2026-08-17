/**
 * Job expenses, ported from the source module's receipt logging: cost +
 * category/vendor/notes + optional receipt photo. New for Harbor Haven:
 * clientPrice (what the client is charged — defaults to cost × job markup)
 * and a billable flag. Billable expenses can later be promoted to line items
 * ("Add to bill"); permit payables live in the Payable table.
 */
import { prisma } from "@/lib/db";
import type { Expense } from "@prisma/client";
import { uploadBase64 } from "@/lib/storage";

export interface AddExpenseInput {
  jobId: number;
  cost: number;
  clientPrice?: number | null;
  billable?: boolean;
  category?: string | null;
  vendor?: string | null;
  notes?: string | null;
  costDate?: Date | null;
  /** base64 data URL of the receipt photo (image or PDF) */
  photoBase64?: string | null;
}

export async function addExpense(input: AddExpenseInput): Promise<Expense> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: input.jobId } });

  const clientPrice =
    input.clientPrice != null
      ? input.clientPrice
      : Math.round(input.cost * Number(job.markup) * 100) / 100;

  let photoKey: string | null = null;
  let photoUrl: string | null = null;
  if (input.photoBase64) {
    const vendorSlug = (input.vendor || "receipt").replace(/\s+/g, "_");
    const stored = await uploadBase64(input.photoBase64, `job${job.id}_${vendorSlug}`);
    if (stored) {
      photoKey = stored.key;
      photoUrl = stored.url;
    }
  }

  return prisma.expense.create({
    data: {
      jobId: input.jobId,
      cost: input.cost,
      clientPrice,
      billable: input.billable ?? true,
      category: input.category?.trim() || null,
      vendor: input.vendor?.trim() || null,
      notes: input.notes?.trim() || null,
      costDate: input.costDate ?? null,
      photoKey,
      photoUrl,
    },
  });
}
