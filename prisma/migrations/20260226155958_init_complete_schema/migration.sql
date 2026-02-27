/*
  Warnings:

  - You are about to drop the column `closingCash` on the `store_shifts` table. All the data in the column will be lost.
  - You are about to drop the column `endTime` on the `store_shifts` table. All the data in the column will be lost.
  - You are about to drop the column `startTime` on the `store_shifts` table. All the data in the column will be lost.
  - You are about to drop the column `startingCash` on the `store_shifts` table. All the data in the column will be lost.
  - You are about to drop the column `storeId` on the `store_shifts` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `store_shifts` table. All the data in the column will be lost.
  - You are about to drop the `inventory_stock` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `price_history` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `store_id` to the `store_shifts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `store_shifts` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "StockLogType" ADD VALUE 'EXPIRED';

-- DropForeignKey
ALTER TABLE "inventory_logs" DROP CONSTRAINT "inventory_logs_inventory_stock_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory_stock" DROP CONSTRAINT "inventory_stock_store_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory_stock" DROP CONSTRAINT "inventory_stock_variant_id_fkey";

-- DropForeignKey
ALTER TABLE "price_history" DROP CONSTRAINT "price_history_product_variant_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_batches" DROP CONSTRAINT "stock_batches_inventory_stock_id_fkey";

-- DropForeignKey
ALTER TABLE "store_shifts" DROP CONSTRAINT "store_shifts_storeId_fkey";

-- DropForeignKey
ALTER TABLE "store_shifts" DROP CONSTRAINT "store_shifts_userId_fkey";

-- DropIndex
DROP INDEX "product_variants_parent_variant_id_idx";

-- DropIndex
DROP INDEX "transactions_created_by_idx";

-- AlterTable
ALTER TABLE "inventory_logs" ADD COLUMN     "supplier_id" UUID;

-- AlterTable
ALTER TABLE "stock_batches" ADD COLUMN     "supplier_id" UUID,
ADD COLUMN     "unit_price" INTEGER;

-- AlterTable
ALTER TABLE "store_shifts" DROP COLUMN "closingCash",
DROP COLUMN "endTime",
DROP COLUMN "startTime",
DROP COLUMN "startingCash",
DROP COLUMN "storeId",
DROP COLUMN "userId",
ADD COLUMN     "closing_cash" INTEGER,
ADD COLUMN     "end_time" TIMESTAMP(3),
ADD COLUMN     "start_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "starting_cash" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "store_id" UUID NOT NULL,
ADD COLUMN     "user_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "stores" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user_stores" ALTER COLUMN "updated_at" DROP DEFAULT;

-- DropTable
DROP TABLE "inventory_stock";

-- DropTable
DROP TABLE "price_history";

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "contact" VARCHAR(100),
    "phone" VARCHAR(20),
    "email" VARCHAR(150),
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_stocks" (
    "id" SERIAL NOT NULL,
    "store_id" UUID NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "stock_qty" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "inventory_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_histories" (
    "id" SERIAL NOT NULL,
    "product_variant_id" INTEGER NOT NULL,
    "old_price" INTEGER,
    "new_price" INTEGER NOT NULL,
    "change_date" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "price_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_name_key" ON "suppliers"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_stocks_variant_id_store_id_key" ON "inventory_stocks"("variant_id", "store_id");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stocks" ADD CONSTRAINT "inventory_stocks_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stocks" ADD CONSTRAINT "inventory_stocks_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_inventory_stock_id_fkey" FOREIGN KEY ("inventory_stock_id") REFERENCES "inventory_stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_inventory_stock_id_fkey" FOREIGN KEY ("inventory_stock_id") REFERENCES "inventory_stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_shifts" ADD CONSTRAINT "store_shifts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_shifts" ADD CONSTRAINT "store_shifts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_histories" ADD CONSTRAINT "price_histories_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
