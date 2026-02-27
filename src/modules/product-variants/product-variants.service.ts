import { Injectable, BadRequestException } from '@nestjs/common';
import { GetVariantsFilterDto } from './dto/get-variants-filter.dto';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '@prisma/client';

// 1. Definisi Tipe Data agar TypeScript mengenali relasi bersarang yang sangat dalam
type VariantWithRelations = Prisma.product_variantsGetPayload<{
  include: {
    product: { include: { category: true } };
    stocks: true;
    parent: { include: { stocks: true } };
    bundleComponents: {
      include: {
        componentVariant: { 
          include: { 
            stocks: true;
            product: true;
            parent: { include: { stocks: true } }; 
          };
        };
      };
    };
  };
}>;

@Injectable()
export class ProductVariantsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filterDto: GetVariantsFilterDto, tenantId: string) {
    const { search, storeId, type, page = 1, limit = 10 } = filterDto;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (storeId && !uuidRegex.test(storeId)) {
      throw new BadRequestException('Format Store ID tidak valid');
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const isStoreIdValid = !!storeId;

    // --- LOGIKA FILTER (WHERE CLAUSE) ---
    const whereClause: Prisma.product_variantsWhereInput = {
      product: {
        tenantId: tenantId,
        ...(type && { type: type as any }),
      },
      ...(search && {
        OR: [
          { sku: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { product: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
      ...(isStoreIdValid && {
        OR: [
          { stocks: { some: { storeId } } },
          { parent: { stocks: { some: { storeId } } } },
          { product: { type: 'PARCEL' } },
        ],
      }),
    };

    // --- QUERY DATABASE ---
    const [rawVariants, total] = await this.prisma.$transaction([
      this.prisma.product_variants.findMany({
        where: whereClause,
        include: {
          product: { include: { category: true } },
          stocks: { where: isStoreIdValid ? { storeId } : {} },
          parent: {
            include: { stocks: { where: isStoreIdValid ? { storeId } : {} } }
          },
          bundleComponents: {
            include: {
              componentVariant: {
                include: { 
                  stocks: { where: isStoreIdValid ? { storeId } : {} },
                  product: true,
                  parent: { // Menarik stok bapaknya komponen jika komponen itu unit turunan
                    include: { stocks: { where: isStoreIdValid ? { storeId } : {} } }
                  }
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.product_variants.count({ where: whereClause }),
    ]);

    const variants = rawVariants as unknown as VariantWithRelations[];

    // --- LOGIKA MAPPING & PERHITUNGAN STOK ---
    const data = variants.map((variant) => {
      let finalStock = 0;
      let componentsDetail: any[] = [];

      if (variant.product.type === 'PARCEL') {
        // A. LOGIKA PARCEL (Menghitung stok dari komponen)
        if (variant.bundleComponents && variant.bundleComponents.length > 0) {
          const availabilities = variant.bundleComponents.map((comp) => {
            let componentStock = 0;
            const vComp = comp.componentVariant;

            // Cek apakah komponen punya parent (misal: "Literan" mengacu ke "Gram")
            if (vComp.parentVariantId && vComp.parent) {
              const pStock = Number(vComp.parent.stocks[0]?.stockQty || 0);
              const mult = vComp.multiplier || 1;
              componentStock = Math.floor(pStock / mult);
            } else {
              componentStock = Number(vComp.stocks[0]?.stockQty || 0);
            }

            const needed = comp.qty || 1;
            const potential = Math.floor(componentStock / needed);

            componentsDetail.push({
              variantId: comp.componentVariantId,
              name: `${vComp.product.name} - ${vComp.name}`,
              neededQty: needed,
              availableStock: componentStock,
              potentialParcelQty: potential
            });

            return potential;
          });
          // Stok paket adalah komponen yang paling sedikit tersedia (bottleneck)
          finalStock = Math.min(...availabilities);
        }
      } else {
        // B. LOGIKA MULTI-UNIT (Regular Product)
        if (variant.parentVariantId && variant.parent) {
          const parentStock = Number(variant.parent.stocks[0]?.stockQty || 0);
          const multiplier = variant.multiplier || 1;
          finalStock = Math.floor(parentStock / multiplier);
        } else {
          finalStock = Number(variant.stocks[0]?.stockQty || 0);
        }
      }

      const displayName = variant.product.name === variant.name 
        ? variant.name 
        : `${variant.product.name} - ${variant.name}`;

      return {
        id: variant.id,
        productId: variant.productId,
        parentVariantId: variant.parentVariantId,
        name: displayName,
        sku: variant.sku,
        price: variant.price,
        category: variant.product.category?.name || 'Uncategorized',
        stock: finalStock,
        unitName: variant.unitName,
        isBaseUnit: !variant.parentVariantId,
        multiplier: variant.multiplier,
        parentName: variant.parent?.name || null,
        productType: variant.product.type,
        components: variant.product.type === 'PARCEL' ? componentsDetail : undefined
      };
    });

    return {
      data,
      meta: {
        total,
        page: Number(page),
        lastPage: Math.ceil(total / take),
      },
    };
  }
}