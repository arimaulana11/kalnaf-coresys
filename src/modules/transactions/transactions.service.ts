import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { PaymentStatus, StockLogType } from '@prisma/client';
// import { TransactionMetadata } from './interfaces/transaction.interface';
import { mapMetadata } from '../../common/utils/metadata-helper';
import { PayDebtDto } from './dto/pay-debt.dto';

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

interface StockUpdateQueue {
  stockId: number;
  qtyReduce: bigint;
  variantName: string;
}

interface TransactionItemInsert {
  product_variant_id: number;
  qty: number;
  unit_price: number;
  cost_price: number;
  discount_amount: number;
  tax_amount: number;
  subtotal: number;
}

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) { }

  async createTransaction(tenantId: string, userId: string, dto: CreateTransactionDto) {
    return await this.prisma.$transaction(async (tx) => {
      // --- 1. CEK SHIFT AKTIF ---
      const activeShift = await tx.store_shifts.findFirst({
        where: { storeId: dto.storeId, userId: userId, status: 'OPEN' },
      });

      if (!activeShift) {
        throw new BadRequestException('Tidak ada shift aktif. Silahkan buka shift terlebih dahulu.');
      }

      // --- 2. PERSIAPAN DATA ---
      let serverCalculatedTotal = 0;
      const transactionItemsToCreate: TransactionItemInsert[] = [];
      const stockUpdates: StockUpdateQueue[] = [];

      // --- 3. LOOP ITEMS DARI REQUEST ---
      for (const item of dto.items) {
        const variant = await tx.product_variants.findUnique({
          where: { id: item.variantId },
          include: {
            products: true,
            bundleComponents: {
              include: {
                componentVariant: {
                  include: {
                    // Komponen parcel pun bisa jadi punya parent (misal isi parcel adalah satuan eceran dari grosir)
                    parent: { include: { stocks: { where: { storeId: dto.storeId } } } },
                    stocks: { where: { storeId: dto.storeId } }
                  }
                }
              }
            },
            parent: { include: { stocks: { where: { storeId: dto.storeId } } } },
            stocks: { where: { storeId: dto.storeId } }
          }
        });

        if (!variant) throw new NotFoundException(`Produk ID ${item.variantId} tidak ditemukan`);

        // A. Perhitungan Harga & Pajak
        const actualPrice = variant.price;
        const itemDiscount = item.discount || 0;
        const subtotalDPP = (actualPrice * item.qty) - itemDiscount;
        let itemTaxTotal = 0;
        const finalItemSubtotal = subtotalDPP + Math.round(itemTaxTotal);
        serverCalculatedTotal += finalItemSubtotal;

        // B. LOGIKA PENGURANGAN STOK
        if (variant.products.type === 'PARCEL') {
          // --- KASUS PARCEL ---
          if (variant.bundleComponents.length === 0) {
            throw new BadRequestException(`Parcel ${variant.name} belum memiliki komponen penyusun.`);
          }

          for (const bundle of variant.bundleComponents) {
            // Logika Parent-First untuk komponen di dalam Parcel
            const compStockSource = bundle.componentVariant.parent
              ? bundle.componentVariant.parent.stocks[0]
              : bundle.componentVariant.stocks[0];

            if (!compStockSource) throw new BadRequestException(`Stok komponen ${bundle.componentVariant.name} belum diatur.`);

            // Multiplier komponen (jika komponen itu sendiri adalah produk konversi)
            const compMultiplier = bundle.componentVariant.multiplier || 1;
            const totalQtyToReduce = BigInt(item.qty * bundle.qty * compMultiplier);

            if (compStockSource.stockQty < totalQtyToReduce) {
              throw new BadRequestException(`Stok komponen ${bundle.componentVariant.name} tidak cukup.`);
            }

            stockUpdates.push({
              stockId: compStockSource.id,
              qtyReduce: totalQtyToReduce,
              variantName: `${variant.name} (isi: ${bundle.componentVariant.name})`
            });
          }
        } else {
          // --- KASUS REGULER / GROSIR (PARENT-BASED) ---
          // Selalu prioritaskan ambil stok dari Parent jika variant ini adalah produk konversi
          const stockSource = variant.parent ? variant.parent.stocks[0] : variant.stocks[0];

          if (!stockSource) throw new BadRequestException(`Stok ${variant.name} tidak tersedia di toko ini.`);

          // Hitung pengurangan berdasarkan multiplier (Contoh: Jual 1 Pack isi 10, multiplier 10, stok berkurang 10)
          const qtyReduce = BigInt(item.qty * (variant.multiplier || 1));

          if (stockSource.stockQty < qtyReduce) {
            throw new BadRequestException(`Stok ${variant.name} tidak cukup.`);
          }

          stockUpdates.push({
            stockId: stockSource.id,
            qtyReduce: qtyReduce,
            variantName: variant.name
          });
        }

        // C. Ambil HPP Snapshot (Selalu merujuk ke Stock Source ID yang benar)
        // Jika produk reguler, pakai stockSource. Jika parcel, HPP biasanya 0 di level header (atau total komponen)
        const snapshotStockId = variant.parent ? variant.parent.stocks[0]?.id : variant.stocks[0]?.id;

        const latestBatch = snapshotStockId ? await tx.stock_batches.findFirst({
          where: { inventoryStockId: snapshotStockId },
          orderBy: { createdAt: 'desc' }
        }) : null;

        transactionItemsToCreate.push({
          product_variant_id: item.variantId,
          qty: item.qty,
          unit_price: actualPrice,
          cost_price: latestBatch?.purchasePrice || 0,
          discount_amount: itemDiscount,
          tax_amount: Math.round(itemTaxTotal),
          subtotal: finalItemSubtotal,
        });
      }

      // --- 4. VALIDASI TOTAL & CREATE HEADER ---
      if (Math.abs(serverCalculatedTotal - dto.totalAmount) > 2) {
        throw new BadRequestException(`Total tidak valid. Server: ${serverCalculatedTotal}, Request: ${dto.totalAmount}`);
      }

      const balanceDue = serverCalculatedTotal - dto.paidAmount;
      const transaction = await tx.transactions.create({
        data: {
          tenant_id: tenantId,
          store_id: dto.storeId,
          created_by: userId,
          shift_id: activeShift.id,
          customer_name: dto.customerName,
          total_amount: serverCalculatedTotal,
          paid_amount: dto.paidAmount,
          balance_due: balanceDue > 0 ? balanceDue : 0,
          payment_method: dto.paymentMethod,
          payment_status: balanceDue > 0 ? (dto.paidAmount > 0 ? PaymentStatus.PARTIAL : PaymentStatus.UNPAID) : PaymentStatus.PAID,
          metadata: dto.metadata || {},
        },
      });

      // --- 5. EKSEKUSI UPDATE STOK & LOGS ---
      for (const update of stockUpdates) {
        await tx.inventory_stock.update({
          where: { id: update.stockId },
          data: { stockQty: { decrement: update.qtyReduce } }
        });

        await tx.inventory_logs.create({
          data: {
            inventoryStockId: update.stockId,
            type: StockLogType.SALE,
            qtyChange: -Number(update.qtyReduce),
            referenceId: transaction.id.toString(),
            notes: `Sale #${transaction.id}: ${update.variantName}`
          }
        });
      }

      // --- 6. SIMPAN DETAIL TRANSAKSI ---
      await tx.transaction_items.createMany({
        data: transactionItemsToCreate.map(item => ({
          ...item,
          transaction_id: transaction.id
        }))
      });

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

  async getDebts(tenantId: string, page: number = 1, limit: number = 10, customerId?: string) {
    const take = Number(limit) || 10;
    const skip = (Number(page) - 1) * take;

    // 1. Buat filter dinamis
    const whereCondition: any = {
      tenant_id: tenantId,
      balance_due: { gt: 0 }, // Sisa bayar lebih dari 0
      payment_status: { not: 'VOID' as any },
    };

    // 2. Tambahkan filter customerId jika dikirim dari query params
    if (customerId) {
      whereCondition.customer_id = customerId;
    }

    const [data, total, summary] = await Promise.all([
      this.prisma.transactions.findMany({
        where: whereCondition,
        include: {
          customer: {
            select: { name: true, phone: true }
          }
        },
        take: take,
        skip: skip,
        orderBy: { transaction_date: 'desc' }
      }),
      this.prisma.transactions.count({ where: whereCondition }),
      // Opsional: Hitung total nominal hutang yang difilter
      this.prisma.transactions.aggregate({
        where: whereCondition,
        _sum: { balance_due: true }
      })
    ]);

    return {
      data,
      meta: {
        total,
        total_debt_amount: summary._sum.balance_due || 0,
        lastPage: Math.ceil(total / take),
        currentPage: Number(page),
        perPage: take
      }
    };
  }

  async payDebt(transactionId: number, dto: PayDebtDto, tenantId: string) {
    // 1. Cari transaksi hutangnya
    const transaction = await this.prisma.transactions.findFirst({
      where: { id: transactionId, tenant_id: tenantId },
    });

    if (!transaction) throw new NotFoundException('Transaksi tidak ditemukan');
    if (transaction.balance_due <= 0) throw new BadRequestException('Transaksi ini sudah lunas');
    if (dto.amount > transaction.balance_due) {
      throw new BadRequestException(`Pembayaran melebihi sisa hutang (Sisa: ${transaction.balance_due})`);
    }

    // 2. Proses update data
    return this.prisma.$transaction(async (tx) => {
      const newBalance = transaction.balance_due - dto.amount;
      const newPaidAmount = transaction.paid_amount + dto.amount;

      // Update tabel transaksi
      const updatedTx = await tx.transactions.update({
        where: { id: transactionId },
        data: {
          paid_amount: newPaidAmount,
          balance_due: newBalance,
          payment_status: newBalance === 0 ? 'PAID' : 'PARTIAL',
        },
      });

      // (Opsional) Jika kamu punya tabel log pembayaran, simpan di sini
      // await tx.debt_payment_logs.create({ data: { ... } });

      return updatedTx;
    });
  }
}
