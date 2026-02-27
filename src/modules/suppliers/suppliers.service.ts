import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) { }

  async create(dto: CreateSupplierDto, tenantId: string) {
    try {
      return await this.prisma.suppliers.create({
        data: {
          name: dto.name,
          contact: dto.contact,
          phone: dto.phone,
          email: dto.email,
          address: dto.address,
          isActive: dto.isActive ?? true,
          tenant: { connect: { id: tenantId } } // Relasi ke tenant
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Supplier dengan nama ini sudah ada di tenant Anda');
      }
      throw error;
    }
  }

  async findAll(tenantId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.suppliers.findMany({
        where: { tenantId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.suppliers.count({ where: { tenantId } }),
    ]);

    return {
      data,
      meta: {
        total,
        currentPage: page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, tenantId: string) {
    const supplier = await this.prisma.suppliers.findFirst({
      where: { id, tenantId },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier dengan ID \${id} tidak ditemukan`);
    }
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto, tenantId: string) {
    await this.findOne(id, tenantId); // Pastikan supplier ada & milik tenant

    return await this.prisma.suppliers.update({
      where: { id },
      data: {
        name: dto.name,
        contact: dto.contact,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return await this.prisma.suppliers.delete({
      where: { id },
    });
  }

  async search(query: string, tenantId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    // Definisikan filter kondisi agar bisa dipakai di findMany dan count
    const whereCondition = {
      tenantId: tenantId,
      OR: [
        { name: { contains: query, mode: 'insensitive' as const } },
        { email: { contains: query, mode: 'insensitive' as const } },
        { contact: { contains: query, mode: 'insensitive' as const } },
        { phone: { contains: query, mode: 'insensitive' as const } },
      ],
    };

    // Jalankan query data dan count secara paralel untuk performa
    const [data, total] = await Promise.all([
      this.prisma.suppliers.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.suppliers.count({
        where: whereCondition,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        currentPage: page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }
}