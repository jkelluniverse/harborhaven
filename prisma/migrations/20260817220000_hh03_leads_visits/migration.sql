-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('LEAD', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ClientSource" AS ENUM ('WEBSITE', 'PHONE', 'REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "VisitFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'CUSTOM');

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'HOME_WATCH';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "archiveReason" TEXT,
ADD COLUMN     "leadNotes" TEXT,
ADD COLUMN     "preferredDates" TEXT,
ADD COLUMN     "propertyAddress" TEXT,
ADD COLUMN     "serviceRequested" TEXT,
ADD COLUMN     "source" "ClientSource" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "status" "ClientStatus" NOT NULL DEFAULT 'LEAD';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "nextVisitDue" TIMESTAMP(3),
ADD COLUMN     "visitFrequency" "VisitFrequency",
ADD COLUMN     "visitRate" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "Visit" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checklist" JSONB NOT NULL,
    "notes" TEXT,
    "photos" JSONB NOT NULL DEFAULT '[]',
    "reportHtml" TEXT,
    "reportSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsLog" (
    "id" SERIAL NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerSid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Data migration (hand-written): clients that existed before lead intake are
-- working clients, not leads.
UPDATE "Client" SET "status" = 'ACTIVE' WHERE "status" = 'LEAD';
