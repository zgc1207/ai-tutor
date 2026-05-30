-- AlterTable
ALTER TABLE "User"
ADD COLUMN "policyVersion" TEXT,
ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN "privacyAcceptedAt" TIMESTAMP(3),
ADD COLUMN "minorNoticeAcceptedAt" TIMESTAMP(3);
