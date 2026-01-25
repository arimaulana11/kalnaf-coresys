import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { products, ProductType, StockLogType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/query-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateParcelDto, UpdateVariantDto } from './dto/update-variant.dto';
import { CreateVariantDto } from './dto/varian-product.dto';
import { ImportProductDto } from './dto/import-product.dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) { }

  // --- PRIVATE VALIDATION HELPERS ---

  private async validateCategory(tenantId: string, categoryId: number) {
    const category = await this.prisma.categories.findFirst({
      where: { id: categoryId, tenantId: tenantId }
    });
    if (!category) throw new NotFoundException('Category not found for this tenant');
  }

  private validateBaseUnitLogic(variants: any[]) {
    const baseUnits = variants.filter(v => v.isBaseUnit === true || v.multiplier === 1);
    if (baseUnits.length > 1) {
      throw new BadRequestException('Hanya boleh ada satu Unit Dasar (Base Unit) per produk.');
    }
    if (baseUnits.length === 0) {
      throw new BadRequestException('Minimal harus ada satu varian yang menjadi Unit Dasar (multiplier 1).');
    }
  }

  private async validateSkuUniqueness(tenantId: string, skus: string[]) {
    const cleanSkus = skus.filter((sku): sku is string => !!sku);
    if (cleanSkus.length === 0) return;

    const existingSku = await this.prisma.product_variants.findFirst({
      where: {
        sku: { in: cleanSkus },
        products: { tenantId: tenantId },
      },
    });

    if (existingSku) {
      throw new BadRequestException(`SKU '${existingSku.sku}' sudah digunakan pada produk lain.`);
    }
  }

  private async validateTaxes(tenantId: string, taxIds?: number[]) {
    if (!taxIds || taxIds.length === 0) return;

    const taxCount = await this.prisma.taxes.count({
      where: { id: { in: taxIds }, tenantId: tenantId },
    });

    if (taxCount !== taxIds.length) {
      throw new BadRequestException('Satu atau lebih ID Pajak tidak valid.');
    }
  }

  private async validateStoreOwnership(tenantId: string, storeIds: string[]) {
    const uniqueStoreIds = [...new Set(storeIds)];
    const stores = await this.prisma.stores.findMany({
      where: {
        id: { in: uniqueStoreIds },
        tenant_id: tenantId, // Menggunakan snake_case sesuai skema DB stores
      },
    });

    if (stores.length !== uniqueStoreIds.length) {
      throw new ForbiddenException('Satu atau lebih Store ID tidak valid atau bukan milik Anda.');
    }
  }

  // --- MAIN METHODS ---

  async create(tenantId: string, dto: CreateProductDto) {
    // 1. Validasi Pre-Transaksi
    await this.validateCategory(tenantId, dto.categoryId);

    // Pastikan tidak ada SKU duplikat dalam request
    const skus = dto.variants.map(v => v.sku).filter((sku): sku is string => !!sku);
    await this.validateSkuUniqueness(tenantId, skus);

    if (dto.taxIds?.length) await this.validateTaxes(tenantId, dto.taxIds);
    if (dto.initialStocks?.length) {
      await this.validateStoreOwnership(tenantId, dto.initialStocks.map(s => s.storeId));
    }

    // 2. Eksekusi Transaksi
    return this.prisma.$transaction(async (tx) => {
      // A. Buat Header Produk
      const product = await tx.products.create({
        data: {
          tenantId,
          categoryId: dto.categoryId,
          name: dto.name,
          description: dto.description,
          imageUrl: dto.imageUrl,
          type: dto.type,
          isActive: true,
          productTaxes: dto.taxIds?.length ? {
            create: dto.taxIds.map(id => ({ taxId: id }))
          } : undefined,
        },
      });

      // B. Logika Mapping Parent-Child menggunakan SKU
      const skuToIdMap = new Map<string, number>();

      // Pisahkan varian Induk (Base) dan Anak (Grosir/Konversi)
      const baseVariantsDto = dto.variants.filter(v => !v.parentSku);
      const childVariantsDto = dto.variants.filter(v => v.parentSku);

      // C. Simpan Varian Induk (Base Units)
      for (const v of baseVariantsDto) {
        const createdV = await tx.product_variants.create({
          data: {
            productId: product.id,
            name: v.name,
            sku: v.sku,
            unitName: v.unitName,
            multiplier: 1,
            price: v.price,
            isBaseUnit: true, // Otomatis true karena tidak punya parent
            // Jika ada bundle/component logic
            bundleComponents: v.components?.length ? {
              create: v.components.map(c => ({
                componentVariantId: c.componentVariantId,
                qty: c.qty
              }))
            } : undefined
          },
        });
        skuToIdMap.set(v.sku, createdV.id);
      }

      // D. Simpan Varian Anak (Non-Base / Grosir)
      for (const v of childVariantsDto) {
        const parentId = skuToIdMap.get(v.parentSku!);
        if (!parentId) {
          throw new BadRequestException(`Parent SKU "${v.parentSku}" tidak ditemukan.`);
        }

        const createdV = await tx.product_variants.create({
          data: {
            productId: product.id,
            name: v.name,
            sku: v.sku,
            unitName: v.unitName,
            multiplier: v.multiplier || 1,
            price: v.price,
            isBaseUnit: false,
            parentVariantId: parentId, // Pastikan prisma generate sudah sukses
          },
        });
        skuToIdMap.set(v.sku, createdV.id);
      }

      // Ambil semua varian yang baru dibuat untuk keperluan return & stok
      const allVariants = await tx.product_variants.findMany({
        where: { productId: product.id }
      });

      // E. Tangani Stok Awal
      // 1. Jika stok dikirim per Varian (Fashion)
      for (const vDto of dto.variants) {
        if (vDto.initialStock && dto.storeId) {
          const variantId = skuToIdMap.get(vDto.sku);
          if (variantId) {
            await this.addInitialStockHelper(tx, variantId, dto.storeId, vDto.initialStock, dto.purchasePrice || 0);
          }
        }
      }

      // 2. Jika stok dikirim Global ke Base Unit (Sembako)
      if (dto.initialStocks?.length) {
        const baseV = allVariants.find(v => v.isBaseUnit) || allVariants[0];
        for (const s of dto.initialStocks) {
          await this.addInitialStockHelper(tx, baseV.id, s.storeId, s.qty, s.purchasePrice || 0, s.expiryDate);
        }
      }

      return {
        ...product,
        productVariants: allVariants
      };
    }, { timeout: 20000 });
  }

  async findAll(tenantId: string, query: ProductQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = {
      tenantId,
      isActive: true,
      ...(query.search && { name: { contains: query.search, mode: 'insensitive' as any } }),
      ...(query.categoryId && { categoryId: query.categoryId }),
    };

    const [total, products] = await Promise.all([
      this.prisma.products.count({ where }),
      this.prisma.products.findMany({
        where,
        skip,
        take: limit,
        include: {
          categories: true,
          productVariants: { include: { stocks: true } },
        },
        orderBy: { id: 'desc' },
      }),
    ]);

    const mappedData = products.map((product) => {
      const baseVariant = product.productVariants.find(v => v.isBaseUnit) || product.productVariants[0];
      const totalBaseStock = baseVariant?.stocks.reduce((acc, curr) => acc + Number(curr.stockQty), 0) || 0;

      const variantsWithStock = product.productVariants.map((v) => ({
        ...v,
        available_stock: v.isBaseUnit
          ? v.stocks.reduce((acc, curr) => acc + Number(curr.stockQty), 0)
          : Math.floor(totalBaseStock / (v.multiplier || 1))
      }));

      return { ...product, productVariants: variantsWithStock };
    });

    return { data: mappedData, meta: { total, page, limit, last_page: Math.ceil(total / limit) } };
  }

  async findOne(tenantId: string, id: number) {
    const product = await this.prisma.products.findFirst({
      where: { id, tenantId },
      include: {
        productTaxes: { include: { taxes: true } },
        categories: true,
        productVariants: {
          include: {
            stocks: true,
            // TAMBAHKAN INI AGAR KOMPONEN PARCEL MUNCUL
            bundleComponents: {
              include: {
                componentVariant: true // Mengambil detail produk yang ada di dalam paket
              }
            }
          }
        }
      }
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(tenantId: string, id: number, dto: UpdateProductDto) {
    const product = await this.findOne(tenantId, id);
    return this.prisma.products.update({
      where: { id: product.id },
      data: {
        name: dto.name,
        description: dto.description,
        imageUrl: dto.imageUrl,
        categoryId: dto.categoryId,
        isActive: dto.isActive
      }
    });
  }

  async search(tenantId: string, queryText: string) {
    return this.prisma.products.findMany({
      where: {
        tenantId,
        OR: [
          { name: { contains: queryText, mode: 'insensitive' } },
          { productVariants: { some: { sku: { contains: queryText, mode: 'insensitive' } } } }
        ]
      },
      include: { productVariants: true, categories: true },
      take: 10
    });
  }

  async addVariant(tenantId: string, productId: number, dto: CreateVariantDto) {
    const product = await this.findOne(tenantId, productId);
    if (dto.sku) await this.validateSkuUniqueness(tenantId, [dto.sku]);

    return this.prisma.product_variants.create({
      data: {
        productId: product.id,
        name: dto.name,
        sku: dto.sku,
        unitName: dto.unitName,
        multiplier: dto.multiplier,
        price: dto.price,
        isBaseUnit: dto.isBaseUnit ?? (dto.multiplier === 1)
      }
    });
  }

  async updateVariant(tenantId: string, variantId: number, dto: UpdateVariantDto) {
    const variant = await this.prisma.product_variants.findFirst({
      where: { id: variantId, products: { tenantId } }
    });
    if (!variant) throw new NotFoundException('Variant not found');
    if (dto.sku && dto.sku !== variant.sku) await this.validateSkuUniqueness(tenantId, [dto.sku]);

    return this.prisma.product_variants.update({
      where: { id: variantId },
      data: { name: dto.name, sku: dto.sku, price: dto.price }
    });
  }

  // src/modules/products/products.service.ts

  async updateParcelComponents(tenantId: string, variantId: number, dto: UpdateParcelDto) {
    // 1. Validasi kepemilikan variant melalui join ke product
    const variant = await this.prisma.product_variants.findFirst({
      where: {
        id: variantId,
        products: { tenantId: tenantId }
      },
      include: { products: true }
    });

    if (!variant) throw new NotFoundException('Varian produk tidak ditemukan');
    if (variant.products.type !== 'PARCEL') {
      throw new BadRequestException('Produk ini bukan bertipe PARCEL');
    }

    // 2. Jalankan transaksi untuk menghapus dan mengisi ulang komponen
    return this.prisma.$transaction(async (tx) => {
      // Hapus komponen lama berdasarkan parentVariantId
      await tx.product_components.deleteMany({
        where: { parentVariantId: variantId }
      });

      // Simpan komponen baru
      const newComponents = await Promise.all(
        dto.components.map((comp) =>
          tx.product_components.create({
            data: {
              parentVariantId: variantId,
              componentVariantId: comp.componentVariantId,
              qty: comp.qty,
            }
          })
        )
      );

      return {
        message: 'Komponen parcel berhasil diperbarui',
        count: newComponents.length
      };
    });
  }

  async remove(tenantId: string, id: number) {
    // 1. Cari produk beserta varian dan stoknya
    const product = await this.prisma.products.findFirst({
      where: { id, tenantId },
      include: {
        productVariants: {
          include: { stocks: true }
        }
      }
    });

    if (!product) throw new NotFoundException('Product not found');

    // 2. Validasi Stok (Gunakan stockQty dan BigInt sesuai error TS)
    const hasStock = product.productVariants.some(v =>
      v.stocks.some(s => s.stockQty > BigInt(0)) // Perbaikan 1: Gunakan stockQty & BigInt
    );

    if (hasStock) {
      throw new BadRequestException('Produk masih memiliki stok fisik di salah satu varian.');
    }

    // 3. Eksekusi Penghapusan dalam Transaksi
    return this.prisma.$transaction(async (tx) => {
      // A. Ambil semua ID varian milik produk ini
      const variantIds = product.productVariants.map(v => v.id);

      // B. Putus hubungan self-reference (Parent-Child)
      await tx.product_variants.updateMany({
        where: { productId: id },
        data: { parentVariantId: null }
      });

      // C. Hapus stok berdasarkan variantId (Perbaikan 2)
      await tx.inventory_stock.deleteMany({
        where: {
          variantId: { in: variantIds }
        }
      });

      // D. Hapus varian
      await tx.product_variants.deleteMany({
        where: { productId: id }
      });

      // E. Hapus produk utama
      return await tx.products.delete({
        where: { id }
      });
    }, { timeout: 10000 });
  }

  async removeVariant(variantId: number, tenantId: string) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Cari varian dan pastikan milik tenant yang benar
      const variant = await tx.product_variants.findFirst({
        where: { id: variantId, products: { tenantId } },
        include: {
          _count: {
            select: {
              children: true,         // Cek apakah ada satuan turunan (misal: Dus merujuk ke Pcs)
              transactionItems: true, // Cek apakah sudah pernah terjual
              asComponent: true       // Cek apakah bagian dari Parcel
            }
          },
          stocks: true // Cek stok fisik
        },
      });

      if (!variant) {
        throw new NotFoundException('Varian tidak ditemukan atau Anda tidak memiliki akses');
      }

      // 2. PROTEKSI: Cek jika varian adalah Induk bagi varian lain
      if (variant._count.children > 0) {
        throw new BadRequestException(
          'Tidak dapat menghapus varian ini karena masih menjadi induk konversi bagi varian lain. Hapus varian turunannya terlebih dahulu.'
        );
      }

      // 3. PROTEKSI: Cek jika sudah ada transaksi (Data Integrity)
      if (variant._count.transactionItems > 0) {
        // Jika sudah ada transaksi, disarankan soft-delete (isActive: false)
        // Tapi jika Anda ingin benar-benar melarang:
        throw new BadRequestException(
          'Varian tidak dapat dihapus karena sudah memiliki riwayat transaksi penjualan.'
        );
      }

      // 4. PROTEKSI: Cek stok fisik
      const totalStock = variant.stocks.reduce((acc, curr) => acc + Number(curr.stockQty), 0);
      if (totalStock > 0) {
        throw new BadRequestException(
          `Varian masih memiliki stok sebanyak ${totalStock}. Kosongkan stok terlebih dahulu melalui adjustment.`
        );
      }

      // 5. Eksekusi Penghapusan
      // Hapus data terkait di inventory_stock terlebih dahulu (karena onDelete: Cascade mungkin tidak mencakup semua relasi manual)
      await tx.inventory_stock.deleteMany({
        where: { variantId: variant.id }
      });

      // Hapus data di price_history
      await tx.price_history.deleteMany({
        where: { product_variant_id: variant.id }
      });

      // Akhirnya hapus varian
      await tx.product_variants.delete({
        where: { id: variantId }
      });

      return {
        success: true,
        message: `Varian ${variant.name} berhasil dihapus.`
      };
    });
  }

  async bulkImport(tenantId: string, storeId: string | undefined, productsData: ImportProductDto[]) {
    // Gunakan transaksi untuk memastikan atomisitas
    return await this.prisma.$transaction(async (tx) => {
      const results: products[] = [];

      for (const item of productsData) {
        // 1. Validasi Kategori milik Tenant
        const category = await tx.categories.findFirst({
          where: { id: item.categoryId, tenantId: tenantId }
        });

        if (!category) {
          throw new BadRequestException(`Category ID ${item.categoryId} tidak ditemukan atau bukan milik tenant Anda`);
        }

        // 2. Create Product dan Variants dalam satu query
        const newProduct = await tx.products.create({
          data: {
            tenantId,
            categoryId: item.categoryId,
            name: item.name,
            type: item.type || ProductType.PHYSICAL,
            productVariants: {
              create: item.variants.map((v) => ({
                sku: v.sku,
                name: `${item.name} - ${v.unitName}`,
                unitName: v.unitName,
                price: v.price,
                multiplier: v.multiplier,
                isBaseUnit: v.multiplier === 1,
              })),
            },
          },
          include: {
            productVariants: true,
          },
        });

        // 3. Logic untuk Parent-Child (Konversi Satuan)
        // Kita cari varian yang multiplier-nya 1 (Base Unit) untuk dijadikan parent bagi yang lain
        const baseVariant = newProduct.productVariants.find(v => v.isBaseUnit);
        if (baseVariant) {
          await tx.product_variants.updateMany({
            where: {
              productId: newProduct.id,
              isBaseUnit: false
            },
            data: {
              parentVariantId: baseVariant.id
            }
          });
        }

        // 4. Handle Initial Stock (Null-Safe & BigInt Safe)
        if (storeId) {
          for (const variant of newProduct.productVariants) {
            // Cari data asal dari DTO berdasarkan SKU
            const importData = item.variants.find((v) => v.sku === variant.sku);

            // Perbaikan Error TS18048 & TS2322: Cek eksplisit
            if (importData && typeof importData.initialStock === 'number' && importData.initialStock > 0) {
              const qty = importData.initialStock;

              // Create Stock
              const stock = await tx.inventory_stock.create({
                data: {
                  storeId: storeId,
                  variantId: variant.id,
                  stockQty: BigInt(qty), // Konversi aman ke BigInt
                },
              });

              // Create Audit Trail (Inventory Log)
              await tx.inventory_logs.create({
                data: {
                  inventoryStockId: stock.id,
                  type: StockLogType.RESTOCK,
                  qtyChange: qty,
                  notes: 'Initial stock from bulk import',
                },
              });
            }
          }
        }

        results.push(newProduct);
      }

      return {
        success: true,
        message: `${results.length} produk berhasil di-import`,
        count: results.length,
      };
    }, {
      timeout: 10000 // Berikan timeout lebih lama untuk bulk operation (10 detik)
    });
  }

  async forceDelete(productId: number, tenantId: string) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Validasi Kepemilikan (Multi-tenancy)
      const product = await tx.products.findFirst({
        where: { id: productId, tenantId },
        include: { productVariants: true }
      });

      if (!product) {
        throw new NotFoundException('Produk tidak ditemukan atau Anda tidak memiliki akses.');
      }

      // 2. Proteksi Transaksi (Integritas Data Keuangan)
      // Cek apakah ada varian dari produk ini yang sudah pernah terjual
      const hasTransactions = await tx.transaction_items.findFirst({
        where: {
          product_variant_id: {
            in: product.productVariants.map(v => v.id)
          }
        }
      });

      if (hasTransactions) {
        throw new BadRequestException(
          'Produk tidak bisa dihapus permanen karena sudah memiliki riwayat transaksi penjualan. Gunakan fitur "Archive" (Non-aktifkan) saja.'
        );
      }

      const variantIds = product.productVariants.map(v => v.id);

      // 3. Hapus Data Inventory & Log (Urutan Berpengaruh)
      // Hapus Logs terlebih dahulu
      await tx.inventory_logs.deleteMany({
        where: { inventoryStock: { variantId: { in: variantIds } } }
      });

      // Hapus Batches
      await tx.stock_batches.deleteMany({
        where: { inventoryStock: { variantId: { in: variantIds } } }
      });

      // Hapus Stocks
      await tx.inventory_stock.deleteMany({
        where: { variantId: { in: variantIds } }
      });

      // 4. Hapus Master Data Varian & Produk
      // Hapus Riwayat Harga
      await tx.price_history.deleteMany({
        where: { product_variant_id: { in: variantIds } }
      });

      // Hapus Komponen Parcel (jika ada)
      await tx.product_components.deleteMany({
        where: {
          OR: [
            { parentVariantId: { in: variantIds } },
            { componentVariantId: { in: variantIds } }
          ]
        }
      });

      // Hapus Varian
      await tx.product_variants.deleteMany({
        where: { productId: product.id }
      });

      // Akhirnya Hapus Produk Utama
      await tx.products.delete({
        where: { id: product.id }
      });

      return {
        success: true,
        message: `Produk "${product.name}" dan seluruh data terkait berhasil dihapus permanen.`
      };
    });
  }

  // --- PRIVATE REUSABLE HELPER ---
  private async addInitialStockHelper(tx: any, variantId: number, storeId: string, qty: number, price: number, expiry?: string) {
    await tx.inventory_stock.upsert({
      where: { variant_id_store_id: { variantId, storeId } },
      update: { stockQty: { increment: BigInt(qty) } },
      create: {
        variantId,
        storeId,
        stockQty: BigInt(qty),
        stockBatches: {
          create: {
            qty,
            purchasePrice: price,
            expiryDate: expiry ? new Date(expiry) : null,
          }
        },
        inventoryLogs: {
          create: {
            type: StockLogType.RESTOCK,
            qtyChange: qty,
            notes: 'Initial stock setup'
          }
        }
      }
    });
  }
}