
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { StockLogType } from '@prisma/client';
import { StockInDto } from './dto/stock-in.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { StockTransferDto } from './dto/stock-movement.dto';
import { GetStockOpnameProductsDto } from './get-stock-opname-products.dto';
import { FinalizeStockOpnameDto } from './dto/finalize-stock-opname.dto';
import { GetInventoryHistoryDto } from './dto/get-inventory-history.dto';
import { isUUID } from 'class-validator';

export interface AuditResult {
    variantId: number;
    prevQty: number;
    newQty: number;
    diff: number;
}
@Injectable()
export class InventoryService {

    private async generateReferenceId(): Promise<string> {
        const now = new Date();
        const year = now.getFullYear(); // 2026

        // 1. Cari log terakhir yang punya format OPN-2026-
        const lastLog = await this.prisma.inventory_logs.findFirst({
            where: {
                referenceId: {
                    startsWith: `OPN-${year}-`,
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
            select: { referenceId: true },
        });

        let nextNumber = 1;

        if (lastLog?.referenceId) {
            const segments = lastLog.referenceId.split('-');
            const lastNum = segments[segments.length - 1]; // Lebih aman daripada .pop()

            if (lastNum) {
                nextNumber = parseInt(lastNum, 10) + 1;
            }
        }

        return `OPN-${year}-${String(nextNumber).padStart(3, '0')}`;
    }

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

    async processOpname(tenantId: string, dto: FinalizeStockOpnameDto) {
        if (!dto) throw new BadRequestException('DTO is missing');
        const { storeId, items = [], auditorName } = dto;

        // 1. Validasi Store
        const store = await this.prisma.stores.findFirst({
            where: { id: storeId, tenantId: tenantId }
        });
        if (!store) throw new BadRequestException('Store tidak ditemukan atau bukan milik tenant ini');

        // 2. Validasi Varian secara massal
        const variantIds = items.map(item => item.variantId);
        const validVariants = await this.prisma.product_variants.findMany({
            where: {
                id: { in: variantIds },
                product: { tenantId: tenantId }
            }
        });

        if (validVariants.length !== items.length) {
            throw new BadRequestException('Ada varian produk yang tidak valid atau milik tenant lain');
        }

        // 3. Transaksi Database
        return await this.prisma.$transaction(async (tx) => {
            const auditSummary: AuditResult[] = [];

            for (const item of items) {
                // A. Ambil stok saat ini
                const currentStock = await tx.inventory_stock.findUnique({
                    where: { variantId_storeId: { variantId: item.variantId, storeId } }
                });

                const systemQty = currentStock ? Number(currentStock.stockQty) : 0;
                const diff = item.actualQty - systemQty;

                // B. Update stok (Upsert)
                const updatedStock = await tx.inventory_stock.upsert({
                    where: { variantId_storeId: { variantId: item.variantId, storeId } },
                    update: { stockQty: BigInt(item.actualQty) },
                    create: {
                        storeId,
                        variantId: item.variantId,
                        stockQty: BigInt(item.actualQty)
                    }
                });

                const referenceId = await this.generateReferenceId();
                // C. Catat ke Inventory Log
                await tx.inventory_logs.create({
                    data: {
                        inventoryStockId: updatedStock.id,
                        type: 'ADJUSTMENT',
                        qtyChange: diff,
                        notes: `Opname by ${auditorName}. Sys: ${systemQty}, Act: ${item.actualQty}. Note: ${item.note || '-'}`,
                        referenceId: referenceId
                    }
                });

                auditSummary.push({
                    variantId: item.variantId,
                    prevQty: systemQty,
                    newQty: item.actualQty,
                    diff
                });
            }

            return auditSummary;
        });
    }

async getProductsForOpname(tenantId: string, query: GetStockOpnameProductsDto) {
    const { search, storeId, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    // 1. VALIDASI UUID (Mencegah Error P2023)
    if (!storeId || !isUUID(storeId)) {
        console.error(`Invalid Store ID format: ${storeId}`);
        // Jika format salah, kita kembalikan data kosong agar tidak crash
        return { success: true, data: [], meta: { totalItems: 0 } };
    }

    // 2. BUILD WHERE CLAUSE
    // Kita ingin mencari produk yang memiliki variant, 
    // dan variant tersebut memiliki stok di storeId tertentu.
    const whereClause: any = {
        tenantId,
        type: 'PHYSICAL',
        isActive: true,
        variants: {
            some: {
                stocks: {
                    some: {
                        storeId: storeId // Filter utama: Pastikan record stok ada di store ini
                    }
                }
            }
        },
        ...(search && {
            OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
                { variants: { some: { name: { contains: search, mode: 'insensitive' } } } },
            ],
        }),
    };

    try {
        const totalItems = await this.prisma.products.count({ where: whereClause });

        const products = await this.prisma.products.findMany({
            where: whereClause,
            include: {
                category: { select: { name: true } },
                variants: {
                    include: {
                        // Filter stok agar hanya menjumlahkan qty di store ini saja
                        stocks: {
                            where: { storeId: storeId }
                        },
                        parent: {
                            include: {
                                stocks: {
                                    where: { storeId: storeId }
                                }
                            }
                        },
                    },
                },
            },
            skip,
            take: limit,
            orderBy: { name: 'asc' },
        });

        const flattenedItems = products.flatMap((product) => {
            return product.variants.map((variant) => {
                const isBase = !variant.parentVariantId;
                const multiplier = Number(variant.multiplier) || 1;

                // Ambil stok yang sudah difilter per store oleh Prisma
                const currentStocks = isBase ? variant.stocks : (variant.parent?.stocks || []);
                const totalBaseStock = currentStocks.reduce((acc, s) => acc + Number(s.stockQty), 0);

                let systemStockInUnit = isBase ? totalBaseStock : (totalBaseStock / multiplier);
                systemStockInUnit = Math.floor(systemStockInUnit);

                return {
                    id: variant.id,
                    productId: product.id,
                    baseVariantId: isBase ? variant.id : variant.parentVariantId,
                    name: `${product.name} - ${variant.name}`,
                    sku: variant.sku,
                    category: product.category?.name || 'Uncategorized',
                    unitName: variant.unitName,
                    multiplier: multiplier,
                    isBase: isBase,
                    baseUnitName: isBase ? variant.unitName : variant.parent?.unitName,
                    systemStock: systemStockInUnit,
                    systemBaseStock: totalBaseStock
                };
            });
        });

        return {
            data: flattenedItems,
            meta: {
                totalItems,
                itemCount: flattenedItems.length,
                itemsPerPage: limit,
                totalPages: Math.ceil(totalItems / limit),
                currentPage: page,
            },
        };

    } catch (error) {
        console.error("Error in getProductsForOpname:", error);
        throw error;
    }
}
    async getStockOpnameHistory(tenantId: string, query: GetInventoryHistoryDto) {
        const { storeId, page = 1, limit = 10 } = query;
        const skip = (page - 1) * limit;

        // 1. Ambil daftar UNIQUE referenceId
        const groups = await this.prisma.inventory_logs.groupBy({
            by: ['referenceId'],
            where: {
                type: 'ADJUSTMENT',
                referenceId: { not: null },
                inventoryStock: {
                    store: {
                        ...(storeId && { id: storeId }),
                        tenantId: tenantId,
                    },
                },
            },
            orderBy: { referenceId: 'desc' },
            skip,
            take: limit,
        });

        // 2. Olah data per grup
        const data = await Promise.all(
            groups.map(async (group) => {
                const refId = group.referenceId!;

                // Ambil semua detail qtyChange untuk sesi ini
                const logs = await this.prisma.inventory_logs.findMany({
                    where: { referenceId: refId },
                    select: { qtyChange: true, createdAt: true, notes: true }
                });

                // Hitung statistik mismatch
                const shortages = logs.filter(l => l.qtyChange < 0).length; // Stok Kurang (Merah)
                const overages = logs.filter(l => l.qtyChange > 0).length;  // Stok Lebih (Hijau)
                const totalMismatches = shortages + overages;

                // Ambil info header dari baris pertama
                const header = logs[0];
                const auditorName = header?.notes?.split('.')[0].replace('Opname by ', '') || 'System';

                return {
                    id: refId,
                    date: header?.createdAt.toISOString().split('T')[0] || '-',
                    auditor: auditorName,
                    items: logs.length,
                    mismatches: totalMismatches,
                    // Tambahkan detail ini untuk mempermudah Frontend mewarnai
                    mismatchDetails: {
                        shortages, // Tampilkan dengan warna Merah di UI
                        overages,  // Tampilkan dengan warna Hijau di UI
                    },
                    status: 'Completed',
                };
            })
        );

        // 3. Pagination Meta
        const totalDistinct = await this.prisma.inventory_logs.groupBy({
            by: ['referenceId'],
            where: {
                type: 'ADJUSTMENT',
                referenceId: { not: null },
                inventoryStock: { store: { tenantId } },
            },
        });

        return {
            data,
            meta: {
                totalItems: totalDistinct.length,
                currentPage: page,
                totalPages: Math.ceil(totalDistinct.length / limit),
            },
        };
    }

    async getOpnameDetailByReference(tenantId: string, referenceId: string) {
        const logs = await this.prisma.inventory_logs.findMany({
            where: {
                referenceId: referenceId,
                inventoryStock: {
                    store: { tenantId: tenantId } // Keamanan: Pastikan milik tenant yang login
                }
            },
            include: {
                inventoryStock: {
                    include: {
                        store: { select: { name: true } },
                        variant: {
                            include: {
                                product: { select: { name: true } }
                            }
                        }
                    }
                }
            },
            orderBy: { id: 'asc' }
        });

        if (logs.length === 0) {
            throw new NotFoundException(`Riwayat opname dengan referensi ${referenceId} tidak ditemukan`);
        }

        // Formatting response agar enak dibaca Frontend
        return {
            referenceId: referenceId,
            date: logs[0].createdAt,
            storeName: logs[0].inventoryStock.store.name,
            totalItems: logs.length,
            details: logs.map(log => ({
                logId: log.id,
                productName: log.inventoryStock.variant.product.name,
                variantName: log.inventoryStock.variant.name,
                sku: log.inventoryStock.variant.sku,
                qtyChange: Number(log.qtyChange),
                notes: log.notes
            }))
        };
    }
}