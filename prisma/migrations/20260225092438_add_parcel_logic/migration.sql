/*
  Warnings:

  - A unique constraint covering the columns `[parent_variant_id,component_variant_id]` on the table `product_components` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "StockLogType" ADD VALUE 'BUNDLE_UNPACK';

-- DropForeignKey
ALTER TABLE "product_components" DROP CONSTRAINT "product_components_component_variant_id_fkey";

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "category_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "product_components_parent_variant_id_component_variant_id_key" ON "product_components"("parent_variant_id", "component_variant_id");

-- AddForeignKey
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_component_variant_id_fkey" FOREIGN KEY ("component_variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_category_id_tenant_id_fkey" FOREIGN KEY ("category_id", "tenant_id") REFERENCES "categories"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
