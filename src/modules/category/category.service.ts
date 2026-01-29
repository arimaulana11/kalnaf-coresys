import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoryService {
  constructor(private prisma: PrismaService) { }

  // Logika khusus untuk endpoint search
  async search(tenantId: string, name?: string) {
    return this.prisma.categories.findMany({
      where: {
        tenantId: tenantId,
        name: name
          ? { contains: name, mode: 'insensitive' }
          : undefined,
      },
    });
  }

  async create(dto: CreateCategoryDto, tenantId: string) {
    return this.prisma.categories.create({
      data: {
        ...dto,
        tenantId: tenantId,
      },
    });
  }

  async findAll(tenantId: string, page: number = 1, limit: number = 10) {
    // Hitung jumlah data yang harus dilewati
    const skip = (page - 1) * limit;

    // Jalankan query secara paralel untuk efisiensi
    const [data, total] = await Promise.all([
      this.prisma.categories.findMany({
        where: { tenantId: tenantId },
        skip: skip,
        take: limit,
        orderBy: { created_at: 'desc' }, // Menampilkan kategori terbaru di atas
      }),
      this.prisma.categories.count({
        where: { tenantId: tenantId },
      }),
    ]);

    // Hitung total halaman
    const lastPage = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        lastPage,
        limit,
      },
    };
  }
  async findOne(id: number, tenantId: string) {
    const category = await this.prisma.categories.findFirst({
      where: { id, tenantId: tenantId },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async update(id: number, dto: UpdateCategoryDto, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.categories.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.categories.delete({
      where: { id },
    });
  }
}