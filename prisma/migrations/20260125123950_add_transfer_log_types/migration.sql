-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockLogType" ADD VALUE 'TRANSFER_IN';
ALTER TYPE "StockLogType" ADD VALUE 'TRANSFER_OUT';

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "parent_variant_id" INTEGER;

-- CreateIndex
CREATE INDEX "product_variants_parent_variant_id_idx" ON "product_variants"("parent_variant_id");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_parent_variant_id_fkey" FOREIGN KEY ("parent_variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
