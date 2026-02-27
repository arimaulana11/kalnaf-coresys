import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { PaymentStatus, StockLogType } from '@prisma/client';
// import { TransactionMetadata } from './interfaces/transaction.interface';
import { mapMetadata } from '../../common/utils/metadata-helper';
import { PayDebtDto } from './dto/pay-debt.dto';

// 1. Definisikan Interface untuk menampung data sementara di memori
interface TempTransactionItem {
  variantId: number;
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
  variantId: number;
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
            product: true,
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
        if (variant.product.type === 'PARCEL') {
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
          variantId: item.variantId,
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
          tenantId: tenantId,
          storeId: dto.storeId,
          createdBy: userId,
          shiftId: activeShift.id,
          customerName: dto.customerName,
          totalAmount: serverCalculatedTotal,
          paidAmount: dto.paidAmount,
          balanceDue: balanceDue > 0 ? balanceDue : 0,
          paymentMethod: dto.paymentMethod,
          paymentStatus: balanceDue > 0 ? (dto.paidAmount > 0 ? PaymentStatus.PARTIAL : PaymentStatus.UNPAID) : PaymentStatus.PAID,
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
          transactionId: transaction.id,
          variantId: item.variantId,
          qty: item.qty,
          unitPrice: item.unit_price,
          costPrice: item.cost_price,
          discountAmount: item.discount_amount || 0,
          taxAmount: item.tax_amount || 0,
          subtotal: item.subtotal
        }))
      });

      return transaction;
    });
  }

  async getTransactionReceipt(id: number, tenantId: string) {
    const transaction = await this.prisma.transactions.findFirst({
      where: {
        id: id,
        tenantId: tenantId, // Keamanan: Pastikan user hanya bisa akses struk milik tenant-nya
      },
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
          },
        },
        items: {
          include: {
            variant: {
              select: {
                name: true,
                sku: true,
              },
            },
          },
        },
        // Ambil detail toko untuk info di header struk
        store: {
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
        storeName: transaction.store?.name,
        address: transaction.store?.address,
        phone: transaction.store?.phone,
        invoiceNumber: `INV-${transaction.id.toString().padStart(6, '0')}`,
        date: transaction.transactionDate,
        cashier: transaction.createdBy, // Bisa join ke tabel users jika ingin nama asli
      },
      customer: transaction.customer || { name: 'Guest', phone: '-' },
      items: transaction.items.map((item) => ({
        name: item.variant.name,
        qty: item.qty,
        price: item.unitPrice,
        discount: item.discountAmount,
        tax: item.taxAmount,
        subtotal: item.subtotal,
      })),
      summary: {
        totalAmount: transaction.totalAmount,
        paidAmount: transaction.paidAmount,
        change: transaction.paidAmount - transaction.totalAmount,
        balanceDue: transaction.balanceDue,
        paymentMethod: transaction.paymentMethod,
        paymentStatus: transaction.paymentStatus,
        notes: transaction.metadata?.['notes'] || '',
        bankInfo: formattedMeta.bank_name,
      },
    };
  }

  async voidTransaction(id: number, tenantId: string, userId: string, reason: string) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Ambil data transaksi
      const transaction = await tx.transactions.findFirst({
        where: { id, tenantId: tenantId },
        include: { items: true }
      });

      if (!transaction) throw new NotFoundException('Transaksi tidak ditemukan');

      // Gunakan casting 'as string' jika TS masih protes saat proses update enum
      if (transaction.paymentStatus === (PaymentStatus.VOID as any)) {
        throw new BadRequestException('Transaksi ini sudah dibatalkan.');
      }

      // 2. Kembalikan Stok
      for (const item of transaction.items) {
        const variant = await tx.product_variants.findUnique({
          where: { id: item.variantId }
        });

        if (!variant) continue;

        // Cari record stok (Gunakan snake_case sesuai error TS2353)
        const stockRecord = await tx.inventory_stock.findFirst({
          where: {
            storeId: transaction.storeId,
            OR: [
              { variantId: item.variantId },
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
          paymentStatus: PaymentStatus.VOID, // Pastikan sudah npx prisma generate
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
      tenantId: tenantId,
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
        orderBy: { transactionDate: 'desc' }
      }),
      this.prisma.transactions.count({ where: whereCondition }),
      // Opsional: Hitung total nominal hutang yang difilter
      this.prisma.transactions.aggregate({
        where: whereCondition,
        _sum: { balanceDue: true }
      })
    ]);

    return {
      data,
      meta: {
        total,
        total_debt_amount: summary._sum.balanceDue || 0,
        lastPage: Math.ceil(total / take),
        currentPage: Number(page),
        perPage: take
      }
    };
  }

  async payDebt(transactionId: number, dto: PayDebtDto, tenantId: string) {
    // 1. Cari transaksi hutangnya
    const transaction = await this.prisma.transactions.findFirst({
      where: { id: transactionId, tenantId: tenantId },
    });

    if (!transaction) throw new NotFoundException('Transaksi tidak ditemukan');
    if (transaction.balanceDue <= 0) throw new BadRequestException('Transaksi ini sudah lunas');
    if (dto.amount > transaction.balanceDue) {
      throw new BadRequestException(`Pembayaran melebihi sisa hutang (Sisa: ${transaction.balanceDue})`);
    }

    // 2. Proses update data
    return this.prisma.$transaction(async (tx) => {
      const newBalance = transaction.balanceDue - dto.amount;
      const newPaidAmount = transaction.paidAmount + dto.amount;

      // Update tabel transaksi
      const updatedTx = await tx.transactions.update({
        where: { id: transactionId },
        data: {
          paidAmount: newPaidAmount,
          balanceDue: newBalance,
          paymentStatus: newBalance === 0 ? 'PAID' : 'PARTIAL',
        },
      });

      // (Opsional) Jika kamu punya tabel log pembayaran, simpan di sini
      // await tx.debt_payment_logs.create({ data: { ... } });

      return updatedTx;
    });
  }

  async getAllHistory(
    tenantId: string,
    query: {
      storeId?: string;
      page?: number;
      limit?: number;
      search?: string;
      status?: string
    }
  ) {
    const { storeId, page = 1, limit = 10, search, status } = query;
    const skip = (page - 1) * limit;

    // 1. Build Filter
    const whereCondition: any = {
      tenantId: tenantId,
      ...(storeId && { storeId: storeId }),
      ...(status && { payment_status: status as any }),
      ...(search && {
        OR: [
          { customer_name: { contains: search, mode: 'insensitive' } },
          // Jika ID adalah integer, pencarian ID biasanya memerlukan query terpisah atau casting
          // Untuk sementara kita cari berdasarkan nama customer
        ],
      }),
    };

    // 2. Execute Query
    const [data, total] = await Promise.all([
      this.prisma.transactions.findMany({
        where: whereCondition,
        orderBy: { transactionDate: 'desc' },
        take: Number(limit),
        skip: Number(skip),
        include: {
          _count: {
            select: { items: true }
          },
          // Sertakan info user pembuat jika perlu ditampilkan di UI
          creator: {
            select: { name: true }
          }
        }
      }),
      this.prisma.transactions.count({ where: whereCondition })
    ]);

    // 3. Format response agar pas dengan UI Frontend
    return {
      data: data.map(tx => ({
        id: `TRX-${tx.id.toString().padStart(6, '0')}`,
        db_id: tx.id, // ID asli untuk kebutuhan API Detail
        customer: tx.customerName || 'Pelanggan Umum',
        total: tx.totalAmount,
        status: tx.paymentStatus,
        time: tx.transactionDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        date: tx.transactionDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
        items: tx._count.items,
        cashier: tx.creator?.name
      })),
      meta: {
        total,
        page: Number(page),
        lastPage: Math.ceil(total / limit)
      }
    };
  }

  async getTransactionDetail(id: number, tenantId: string) {
    const transaction = await this.prisma.transactions.findFirst({
      where: {
        id: id,
        tenantId: tenantId,
      },
      include: {
        creator: {
          select: { name: true }
        },
        items: {
          include: {
            variant: true
          }
        }
      },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaksi #${id} tidak ditemukan`);
    }

    // --- LOGIKA PERHITUNGAN TAX ---
    // Karena di schema kamu tax disimpan per item, kita kalkulasi totalnya
    const subtotal = transaction.items.reduce((acc, item) => acc + (item.unitPrice * item.qty), 0);
    const totalTax = transaction.items.reduce((acc, item) => acc + item.taxAmount, 0);
    const totalDiscount = transaction.items.reduce((acc, item) => acc + item.discountAmount, 0);

    // Asumsi percentage pajak (misal 11%) - bisa diambil dari metadata atau setting tenant
    const taxPercentage = subtotal > 0 ? Math.round((totalTax / subtotal) * 100) : 0;

    return {
      db_id: transaction.id, // ID asli untuk keperluan operasional (Void, dll)
      id: `TRX-${transaction.transactionDate.getFullYear()}-${transaction.id.toString().padStart(3, '0')}`,
      status: transaction.paymentStatus,
      date: transaction.transactionDate.toISOString().split('T')[0], // Format: YYYY-MM-DD
      time: transaction.transactionDate.toLocaleTimeString('id-ID', { hour12: false }),
      cashier_name: transaction.creator?.name || 'Unknown',
      customer_name: transaction.customerName || 'Pelanggan Umum',
      payment_method: transaction.paymentMethod,
      items: transaction.items.map(item => ({
        product_id: item.variantId,
        name: item.variant.name,
        quantity: item.qty,
        price: item.unitPrice,
        total: item.subtotal
      })),
      pricing: {
        subtotal: subtotal,
        tax_percentage: taxPercentage,
        tax_amount: totalTax,
        discount_amount: totalDiscount,
        grand_total: transaction.totalAmount
      }
    };
  }
}
