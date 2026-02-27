
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { StockLogType } from '@prisma/client';
import { StockInDto } from './dto/stock-in.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { StockOpnameDto, StockTransferDto } from './dto/stock-movement.dto';

@Injectable()
export class InventoryService {
    constructor(private prisma: PrismaService) { }

    async findAllStock(tenantId: string, storeId: string) {
        if (!storeId) throw new BadRequestException('Header store-id diperlukan');

        return this.prisma.inventory_stock.findMany({
            where: {
                storeId: storeId,
                variant: { product: { tenantId } }
            },
            include: {
                variant: {
                    select: { name: true, sku: true, unitName: true }
                }
            }
        });
    }

    async processStockIn(tenantId: string, storeId: string, dto: StockInDto) {
        // 1. CEK APAKAH VARIANT EKSIS
        const variant = await this.prisma.product_variants.findFirst({
            where: {
                id: dto.variantId,
                product: { tenantId } // Pastikan varian ini milik tenant yang login
            }
        });

        if (!variant) {
            throw new BadRequestException(`Variant ID ${dto.variantId} tidak ditemukan atau bukan milik Anda.`);
        }

        return this.prisma.$transaction(async (tx) => {
            // 2. LANJUTKAN UPSERT JIKA VALID
            const stock = await tx.inventory_stock.upsert({
                where: {
                    variantId_storeId: {
                        variantId: dto.variantId,
                        storeId: storeId
                    }
                },
                update: {
                    stockQty: { increment: BigInt(dto.qty) }
                },
                create: {
                    storeId: storeId,
                    variantId: dto.variantId,
                    stockQty: BigInt(dto.qty)
                }
            });

            // ... record log ...
            await tx.inventory_logs.create({
                data: {
                    inventoryStockId: stock.id,
                    type: StockLogType.RESTOCK,
                    qtyChange: dto.qty,
                    notes: dto.notes || 'Restock manual',
                    referenceId: dto.referenceId
                }
            });

            return stock;
        });
    }

    async processAdjustment(tenantId: string, storeId: string, dto: StockAdjustmentDto) {
        return this.prisma.$transaction(async (tx) => {
            // Ambil data stok sekarang
            const currentStock = await tx.inventory_stock.findUnique({
                where: {
                    variantId_storeId: {
                        variantId: dto.variantId,
                        storeId: storeId
                    }
                }
            });

            if (!currentStock) throw new BadRequestException('Data stok barang tidak ditemukan di toko ini');

            // Update stok
            const updatedStock = await tx.inventory_stock.update({
                where: { id: currentStock.id },
                data: {
                    stockQty: { increment: BigInt(dto.adjustmentQty) }
                }
            });

            // Record Log
            await tx.inventory_logs.create({
                data: {
                    inventoryStockId: updatedStock.id,
                    type: StockLogType.ADJUSTMENT,
                    qtyChange: dto.adjustmentQty,
                    notes: dto.reason
                }
            });

            return updatedStock;
        });
    }

    async processTransfer(tenantId: string, dto: StockTransferDto) {
        // 1. Validasi awal: Toko tidak boleh sama
        if (dto.fromStoreId === dto.toStoreId) {
            throw new BadRequestException('Toko asal dan tujuan tidak boleh sama');
        }

        // 2. Ambil data toko & validasi kepemilikan variant dalam satu waktu
        // Kita lakukan ini di luar transaksi untuk mengurangi beban lock database
        const [fromStore, toStore, variant] = await Promise.all([
            this.prisma.stores.findUnique({ where: { id: dto.fromStoreId } }),
            this.prisma.stores.findUnique({ where: { id: dto.toStoreId } }),
            this.prisma.product_variants.findFirst({
                where: {
                    id: dto.variantId,
                    product: { tenantId } // Security: Pastikan barang milik tenant ini
                }
            })
        ]);

        if (!fromStore) throw new BadRequestException('Toko asal tidak ditemukan');
        if (!toStore) throw new BadRequestException('Toko tujuan tidak ditemukan');
        if (!variant) throw new BadRequestException('Varian produk tidak ditemukan atau akses ditolak');

        // 3. Jalankan Transaksi Atomik
        return this.prisma.$transaction(async (tx) => {

            // A. Cek ketersediaan stok di toko asal
            const sourceStock = await tx.inventory_stock.findUnique({
                where: {
                    variantId_storeId: {
                        variantId: dto.variantId,
                        storeId: dto.fromStoreId
                    }
                }
            });

            // Debugging log (opsional)
            console.log(`Pengecekan Stok di ${fromStore.name}:`, sourceStock?.stockQty.toString());

            if (!sourceStock || sourceStock.stockQty < BigInt(dto.qty)) {
                throw new BadRequestException(
                    `Stok di ${fromStore.name} tidak cukup. Tersedia: ${sourceStock?.stockQty || 0}, Diminta: ${dto.qty}`
                );
            }

            // B. Kurangi stok di toko asal
            const updatedSource = await tx.inventory_stock.update({
                where: { id: sourceStock.id },
                data: {
                    stockQty: { decrement: BigInt(dto.qty) }
                }
            });

            // C. Tambah atau buat stok di toko tujuan (Upsert)
            const targetStock = await tx.inventory_stock.upsert({
                where: {
                    variantId_storeId: {
                        variantId: dto.variantId,
                        storeId: dto.toStoreId
                    }
                },
                update: {
                    stockQty: { increment: BigInt(dto.qty) }
                },
                create: {
                    storeId: dto.toStoreId,
                    variantId: dto.variantId,
                    stockQty: BigInt(dto.qty)
                }
            });

            // D. Buat Audit Log untuk Toko Asal (Stok Keluar)
            await tx.inventory_logs.create({
                data: {
                    inventoryStockId: updatedSource.id,
                    type: StockLogType.TRANSFER_OUT, // Gunakan string jika enum bermasalah, atau StockLogType.TRANSFER_OUT
                    qtyChange: -dto.qty,
                    notes: `Transfer ke [${toStore.name}]. Ket: ${dto.note || '-'}`
                }
            });

            // E. Buat Audit Log untuk Toko Tujuan (Stok Masuk)
            await tx.inventory_logs.create({
                data: {
                    inventoryStockId: targetStock.id,
                    type: StockLogType.TRANSFER_IN,
                    qtyChange: dto.qty,
                    notes: `Terima transfer dari [${fromStore.name}]. Ket: ${dto.note || '-'}`
                }
            });

            return {
                success: true,
                message: `Berhasil mentransfer ${dto.qty} item dari ${fromStore.name} ke ${toStore.name}`
            };
        });
    }

    async processOpname(tenantId: string, storeId: string, dto: StockOpnameDto) {
        if (!storeId) throw new BadRequestException('Header store-id diperlukan');

        // 1. Validasi varian dan kepemilikan
        const variant = await this.prisma.product_variants.findFirst({
            where: { id: dto.variantId, product: { tenantId } }
        });
        if (!variant) throw new BadRequestException('Varian tidak ditemukan');

        return this.prisma.$transaction(async (tx) => {
            // 2. Ambil stok saat ini
            const currentStock = await tx.inventory_stock.findUnique({
                where: {
                    variantId_storeId: {
                        variantId: dto.variantId,
                        storeId: storeId
                    }
                }
            });

            const systemQty = currentStock ? Number(currentStock.stockQty) : 0;
            const diff = dto.actualQty - systemQty; // Hitung selisihnya

            // 3. Update stok menjadi angka aktual
            const stock = await tx.inventory_stock.upsert({
                where: {
                    variantId_storeId: {
                        variantId: dto.variantId,
                        storeId: storeId
                    }
                },
                update: { stockQty: BigInt(dto.actualQty) },
                create: {
                    storeId: storeId,
                    variantId: dto.variantId,
                    stockQty: BigInt(dto.actualQty)
                }
            });

            // 4. Catat di Log hanya jika ada selisih
            await tx.inventory_logs.create({
                data: {
                    inventoryStockId: stock.id,
                    type: 'ADJUSTMENT',
                    qtyChange: diff,
                    notes: `Stock Opname: (Sistem: ${systemQty}, Fisik: ${dto.actualQty}). Ket: ${dto.note || '-'}`
                }
            });

            return {
                message: 'Stock Opname berhasil diproses',
                systemQty,
                actualQty: dto.actualQty,
                difference: diff
            };
        });
    }

    async getVariantHistory(
        tenantId: string,
        variantId: number,
        options: { storeId: string; page: number; limit: number }
    ) {
        const { storeId, page, limit } = options;

        // 1. Validasi kepemilikan
        const variant = await this.prisma.product_variants.findFirst({
            where: { id: variantId, product: { tenantId } }
        });
        if (!variant) throw new NotFoundException('Varian tidak ditemukan');

        // 2. Query data
        const [logs, total] = await Promise.all([
            this.prisma.inventory_logs.findMany({
                where: {
                    inventoryStock: {
                        variantId: variantId,
                        storeId: storeId
                    }
                },
                include: {
                    inventoryStock: {
                        select: {
                            store: { select: { name: true } }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                // Gunakan perhitungan langsung di sini untuk menghapus variabel 'skip'
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.inventory_logs.count({
                where: {
                    inventoryStock: {
                        variantId: variantId,
                        storeId: storeId
                    }
                }
            })
        ]);

        return {
            data: logs,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    async getLogs(
        tenantId: string,
        variantId?: number,
        page: number = 1,
        limit: number = 10
    ) {
        // 1. Definisikan filter agar reusable untuk findMany dan count
        const whereCondition = {
            inventoryStock: {
                variantId: variantId, // Jika undefined, Prisma otomatis mengabaikan filter ini
                variant: {
                    product: { tenantId }
                }
            }
        };

        // 2. Jalankan query data dan hitung total secara paralel
        const [logs, total] = await Promise.all([
            this.prisma.inventory_logs.findMany({
                where: whereCondition,
                include: {
                    inventoryStock: {
                        include: {
                            variant: {
                                select: { name: true, sku: true } // Ambil data penting saja
                            },
                            store: {
                                select: { name: true }
                            }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.inventory_logs.count({
                where: whereCondition
            })
        ]);

        // 3. Return dengan format paginasi standar
        return {
            data: logs,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    async findLowStock(
        tenantId: string,
        options: { storeId: string; threshold: number; page: number; limit: number }
    ) {
        const { storeId, threshold, page, limit } = options;

        const whereCondition = {
            storeId: storeId,
            stockQty: {
                lt: BigInt(threshold) // Less than threshold
            },
            variant: {
                product: {
                    tenantId: tenantId
                }
            }
        };

        const [data, total] = await Promise.all([
            this.prisma.inventory_stock.findMany({
                where: whereCondition,
                include: {
                    variant: {
                        select: {
                            id: true,
                            name: true,
                            sku: true,
                            price: true,
                            product: { select: { name: true } }
                        }
                    }
                },
                orderBy: { stockQty: 'asc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.inventory_stock.count({
                where: whereCondition
            })
        ]);

        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    }
}