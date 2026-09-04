-- AlterTable
ALTER TABLE "Org" ADD COLUMN     "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "registeredAddress" TEXT;
