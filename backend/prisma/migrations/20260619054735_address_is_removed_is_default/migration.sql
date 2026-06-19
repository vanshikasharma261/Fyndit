-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "is_default" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_removed" BOOLEAN NOT NULL DEFAULT false;
