import { Injectable } from '@nestjs/common';
import { GetVariantsFilterDto } from './dto/get-variants-filter.dto';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ProductVariantsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filterDto: GetVariantsFilterDto, tenantId: string) {
    const { search, storeId, type, page = 1, limit = 10 } = filterDto;
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // 1. Membangun object 'where' sesuai dengan nama relasi di schema Anda
    const whereClause: any = {
      // Menggunakan 'products' (jamak) sesuai saran error Prisma
      products: {
        tenantId: tenantId,
        ...(type && { type: type }), 
      },
      ...(search && {
        OR: [
          { sku: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          // Filter ke nama produk utama melalui relasi 'products'
          { products: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
      ...(storeId && {
        // Menggunakan 'stocks' sesuai petunjuk di error log
        stocks: {
          some: { store_id: storeId }, 
        },
      }),
    };

    // 2. Eksekusi query menggunakan $transaction
    const [data, total] = await this.prisma.$transaction([
      this.prisma.product_variants.findMany({
        where: whereClause,
        include: {
          products: true, // Berdasarkan error: "Did you mean products?"
          stocks: true,   // Berdasarkan error: "Available options are... stocks"
        },
        orderBy: {
          createdAt: 'desc', 
        },
        skip,
        take,
      }),
      this.prisma.product_variants.count({
        where: whereClause,
      }),
    ]);

    return {
      success: true,
      statusCode: 200,
      message: 'Data variants fetched successfully',
      data,
      meta: {
        total,
        page: Number(page),
        lastPage: Math.ceil(total / take),
      },
    };
  }
}