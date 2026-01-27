import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { PaymentStatus, StockLogType } from '@prisma/client';
import { TransactionMetadata } from './interfaces/transaction.interface';
import { mapMetadata } from 'src/common/utils/metadata-helper';

// 1. Definisikan Interface untuk menampung data sementara di memori
interface TempTransactionItem {
  product_variant_id: number;
  qty: number;
  unit_price: number;
  cost_price: number;
  discount_amount: number;
  tax_amount: number;
  subtotal: number;
  stockSourceId: number;
  qtyReduce: bigint;
  variantName: string;
}

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) { }

  async createTransaction(tenantId: string, userId: string, dto: CreateTransactionDto) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Cek Shift Aktif
      const activeShift = await tx.store_shifts.findFirst({
        where: { storeId: dto.storeId, userId: userId, status: 'OPEN' },
      });

      if (!activeShift) {
        throw new BadRequestException('Tidak ada shift aktif. Silahkan buka shift terlebih dahulu.');
      }

      // 2. Handle Quick Add Customer
      let finalCustomerId = dto.customerId;
      if (!finalCustomerId && (dto.customerName || dto.customerPhone)) {
        const existing = dto.customerPhone
          ? await tx.customers.findFirst({ where: { tenantId, phone: dto.customerPhone } })
          : null;

        if (existing) {
          finalCustomerId = existing.id;
        } else {
          const newCustomer = await tx.customers.create({
            data: {
              tenantId: tenantId,
              name: dto.customerName || 'Walk-in Customer',
              phone: dto.customerPhone,
            },
          });
          finalCustomerId = newCustomer.id;
        }
      }

      // 3. Persiapan Hitung Ulang Server
      let serverCalculatedTotal = 0;
      // Berikan tipe data agar tidak error TS2345 (never)
      const transactionItemsToCreate: TempTransactionItem[] = [];

      // 4. Loop Items untuk Validasi Harga & Stok
      for (const item of dto.items) {
        const variant = await tx.product_variants.findUnique({
          where: { id: item.variantId },
          include: {
            products: { include: { productTaxes: { include: { taxes: true } } } },
            parent: { include: { stocks: { where: { storeId: dto.storeId } } } },
            stocks: { where: { storeId: dto.storeId } }
          }
        });

        if (!variant) throw new NotFoundException(`Produk ID ${item.variantId} tidak ditemukan`);

        // --- PROTEKSI HARGA ---
        const actualPrice = variant.price;
        const itemDiscount = item.discount || 0;
        const subtotalDPP = (actualPrice * item.qty) - itemDiscount;

        // Hitung Pajak
        let itemTaxTotal = 0;
        variant.products?.productTaxes?.forEach(pt => {
          itemTaxTotal += (subtotalDPP * (pt.taxes.rate / 100));
        });

        const finalItemSubtotal = subtotalDPP + Math.round(itemTaxTotal);
        serverCalculatedTotal += finalItemSubtotal;

        // Cek Sumber Stok
        const stockSource = variant.parent ? variant.parent.stocks[0] : variant.stocks[0];
        if (!stockSource) throw new BadRequestException(`Stok ${variant.name} belum diatur di toko ini.`);

        const qtyReduce = BigInt(item.qty * (variant.multiplier || 1));
        if (stockSource.stockQty < qtyReduce) {
          throw new BadRequestException(`Stok ${variant.name} tidak cukup (Tersisa: ${stockSource.stockQty.toString()})`);
        }

        // Ambil HPP Snapshot
        const latestBatch = await tx.stock_batches.findFirst({
          where: { inventoryStockId: stockSource.id },
          orderBy: { createdAt: 'desc' }
        });

        // Simpan ke array memori
        transactionItemsToCreate.push({
          product_variant_id: item.variantId,
          qty: item.qty,
          unit_price: actualPrice,
          cost_price: latestBatch?.purchasePrice || 0,
          discount_amount: itemDiscount,
          tax_amount: Math.round(itemTaxTotal),
          subtotal: finalItemSubtotal,
          stockSourceId: stockSource.id,
          qtyReduce: qtyReduce,
          variantName: variant.name
        });
      }

      // 5. VALIDASI TOTAL AMOUNT (Anti-Fraud)
      if (Math.abs(serverCalculatedTotal - dto.totalAmount) > 1) { // Toleransi pembulatan 1 rupiah
        throw new BadRequestException(
          `Total tidak valid. Server: ${serverCalculatedTotal}, Request: ${dto.totalAmount}`
        );
      }

      // 6. Buat Header Transaksi
      const balanceDue = serverCalculatedTotal - dto.paidAmount;
      const transaction = await tx.transactions.create({
        data: {
          tenant_id: tenantId,
          store_id: dto.storeId,
          created_by: userId,
          shift_id: activeShift.id,
          customer_id: finalCustomerId,
          customer_name: dto.customerName,
          total_amount: serverCalculatedTotal,
          paid_amount: dto.paidAmount,
          balance_due: balanceDue > 0 ? balanceDue : 0,
          payment_status: balanceDue > 0 ? (dto.paidAmount > 0 ? PaymentStatus.PARTIAL : PaymentStatus.UNPAID) : PaymentStatus.PAID,
          payment_method: dto.paymentMethod,
          metadata: dto.metadata || {},
        },
      });

      // 7. Simpan Detail, Update Stok & Logs (Iterasi dari Memory Array)
      for (const tItem of transactionItemsToCreate) {
        await tx.transaction_items.create({
          data: {
            transaction_id: transaction.id,
            product_variant_id: tItem.product_variant_id,
            qty: tItem.qty,
            unit_price: tItem.unit_price,
            cost_price: tItem.cost_price,
            discount_amount: tItem.discount_amount,
            tax_amount: tItem.tax_amount,
            subtotal: tItem.subtotal,
          },
        });

        await tx.inventory_stock.update({
          where: { id: tItem.stockSourceId },
          data: { stockQty: { decrement: tItem.qtyReduce } }
        });

        await tx.inventory_logs.create({
          data: {
            inventoryStockId: tItem.stockSourceId,
            type: StockLogType.SALE,
            qtyChange: -Number(tItem.qtyReduce),
            referenceId: transaction.id.toString(),
            notes: `Sale #${transaction.id}: ${tItem.variantName} x${tItem.qty}`
          }
        });
      }

      return transaction;
    });
  }

  async getTransactionReceipt(id: number, tenantId: string) {
    const transaction = await this.prisma.transactions.findFirst({
      where: {
        id: id,
        tenant_id: tenantId, // Keamanan: Pastikan user hanya bisa akses struk milik tenant-nya
      },
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
          },
        },
        transaction_items: {
          include: {
            product_variants: {
              select: {
                name: true,
                sku: true,
              },
            },
          },
        },
        // Ambil detail toko untuk info di header struk
        stores: {
          select: {
            name: true,
            address: true,
            phone: true,
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaksi dengan ID ${id} tidak ditemukan.`);
    }

    const formattedMeta = mapMetadata(transaction.metadata);
    if (formattedMeta.bank_name === '-') {
      formattedMeta.bank_name = 'Cash'
    }
    // Format response untuk memudahkan frontend merender struk
    return {
      header: {
        storeName: transaction.stores?.name,
        address: transaction.stores?.address,
        phone: transaction.stores?.phone,
        invoiceNumber: `INV-${transaction.id.toString().padStart(6, '0')}`,
        date: transaction.transaction_date,
        cashier: transaction.created_by, // Bisa join ke tabel users jika ingin nama asli
      },
      customer: transaction.customer || { name: 'Guest', phone: '-' },
      items: transaction.transaction_items.map((item) => ({
        name: item.product_variants.name,
        qty: item.qty,
        price: item.unit_price,
        discount: item.discount_amount,
        tax: item.tax_amount,
        subtotal: item.subtotal,
      })),
      summary: {
        totalAmount: transaction.total_amount,
        paidAmount: transaction.paid_amount,
        change: transaction.paid_amount - transaction.total_amount,
        balanceDue: transaction.balance_due,
        paymentMethod: transaction.payment_method,
        paymentStatus: transaction.payment_status,
        notes: transaction.metadata?.['notes'] || '',
        bankInfo: formattedMeta.bank_name,
      },
    };
  }

  async voidTransaction(id: number, tenantId: string, userId: string, reason: string) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Ambil data transaksi
      const transaction = await tx.transactions.findFirst({
        where: { id, tenant_id: tenantId },
        include: { transaction_items: true }
      });

      if (!transaction) throw new NotFoundException('Transaksi tidak ditemukan');

      // Gunakan casting 'as string' jika TS masih protes saat proses update enum
      if (transaction.payment_status === (PaymentStatus.VOID as any)) {
        throw new BadRequestException('Transaksi ini sudah dibatalkan.');
      }

      // 2. Kembalikan Stok
      for (const item of transaction.transaction_items) {
        const variant = await tx.product_variants.findUnique({
          where: { id: item.product_variant_id }
        });

        if (!variant) continue;

        // Cari record stok (Gunakan snake_case sesuai error TS2353)
        const stockRecord = await tx.inventory_stock.findFirst({
          where: {
            storeId: transaction.store_id,
            OR: [
              { variantId: item.product_variant_id },
              { variantId: variant.parentVariantId || undefined } // Gunakan parentVariantId
            ]
          }
        });

        if (stockRecord) {
          const qtyToRestore = BigInt(item.qty * (variant.multiplier || 1));

          await tx.inventory_stock.update({
            where: { id: stockRecord.id },
            data: { stockQty: { increment: qtyToRestore } }
          });

          // Catat Log (Gunakan casting jika enum belum di-generate)
          await tx.inventory_logs.create({
            data: {
              inventoryStockId: stockRecord.id,
              type: StockLogType.VOID_RESTORE as any,
              qtyChange: Number(qtyToRestore),
              referenceId: transaction.id.toString(),
              notes: `VOID #${transaction.id}: ${reason}`
            }
          });
        }
      }

      // 3. Update Status Transaksi
      return await tx.transactions.update({
        where: { id },
        data: {
          payment_status: PaymentStatus.VOID, // Pastikan sudah npx prisma generate
          metadata: {
            ...(transaction.metadata as object),
            void_reason: reason,
            void_at: new Date(),
            void_by: userId
          }
        }
      });
    });
  }
}
