-- CreateEnum
CREATE TYPE "LineItemKind" AS ENUM ('PERMIT', 'MANAGEMENT_FEE', 'MATERIALS', 'LABOR', 'HOME_WATCH_VISIT', 'OTHER');

-- CreateEnum
CREATE TYPE "PayableStatus" AS ENUM ('OWED', 'PAID');

-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'CANCELED';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "squareCustomerId" TEXT;

-- (Expense seam columns migrated into Payable below, then dropped.)

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "publicUrl" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "squareInvoiceStatus" TEXT,
ADD COLUMN     "squareOrderId" TEXT,
ADD COLUMN     "stage" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "estimateSentAt" TIMESTAMP(3),
ADD COLUMN     "estimateToken" TEXT;

-- AlterTable (hand-edited: rename keeps existing data; Prisma generated drop+add)
ALTER TABLE "Payment" RENAME COLUMN "paidAt" TO "receivedAt";
ALTER TABLE "Payment" ADD COLUMN "feeAmount" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "LineItem" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "invoiceId" INTEGER,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "kind" "LineItemKind" NOT NULL DEFAULT 'OTHER',
    "sourceExpenseId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payable" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "lineItemId" INTEGER,
    "payeeName" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "PayableStatus" NOT NULL DEFAULT 'OWED',
    "paidAt" TIMESTAMP(3),
    "paidVia" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LineItem_sourceExpenseId_key" ON "LineItem"("sourceExpenseId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_squareInvoiceId_key" ON "Invoice"("squareInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_squareOrderId_key" ON "Invoice"("squareOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_estimateToken_key" ON "Job"("estimateToken");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_squarePaymentId_key" ON "Payment"("squarePaymentId");

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_sourceExpenseId_fkey" FOREIGN KEY ("sourceExpenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "LineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data migration (hand-written): HH-01 stored the permit-payable seam as two
-- nullable columns on Expense. Promote any populated pairs to real Payable
-- rows, then drop the seam columns.
INSERT INTO "Payable" ("jobId", "payeeName", "amount", "status", "note")
SELECT e."jobId", e."payableTo", e."payableAmount", 'OWED',
       'Migrated from expense #' || e."id"
FROM "Expense" e
WHERE e."payableTo" IS NOT NULL AND e."payableAmount" IS NOT NULL;

ALTER TABLE "Expense" DROP COLUMN "payableAmount";
ALTER TABLE "Expense" DROP COLUMN "payableTo";

-- Settings key rename: HH-01 seeded "markup_default"; HH-02 standardizes on
-- "default_markup" (skipped if a default_markup row already exists).
UPDATE "AppSetting" SET "key" = 'default_markup'
WHERE "key" = 'markup_default'
  AND NOT EXISTS (SELECT 1 FROM "AppSetting" WHERE "key" = 'default_markup');

