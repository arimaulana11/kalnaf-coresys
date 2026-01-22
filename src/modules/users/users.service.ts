import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import * as bcrypt from 'bcrypt';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) { }

  async createStaff(dto: CreateStaffDto, tenantId: string) {
    // 1. Cek duplikasi email
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email sudah terdaftar');

    // 2. Hash password
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(dto.password, salt);

    // 3. Simpan Staff
    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password_hash: hashedPassword,
        role: dto.role,
        tenant_id: tenantId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tenant_id: true,
      },
    });
  }

  async findAllStaff(tenantId: string, page: number = 1, limit: number = 10) {
    // Hitung jumlah data yang harus dilewati
    const skip = (page - 1) * limit;

    // Jalankan query secara paralel untuk efisiensi
    const [items, totalItems] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          tenant_id: tenantId,
          role: { not: 'owner' },
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          is_active: true,
          created_at: true,
        },
        skip: skip,
        take: limit,
        orderBy: { created_at: 'desc' }, // Urutkan dari yang terbaru
      }),
      this.prisma.user.count({
        where: {
          tenant_id: tenantId,
          role: { not: 'owner' },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return {
      items,
      meta: {
        totalItems,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPages,
        currentPage: page,
      },
    };
  }

  async updateStaff(staffId: string, ownerTenantId: string, dto: UpdateStaffDto) {
  // 1. Cek apakah staff tersebut ada dan milik tenant owner ini
  const staff = await this.prisma.user.findFirst({
    where: {
      id: staffId,
      tenant_id: ownerTenantId,
      role: { not: 'owner' }, // Opsional: mencegah owner mengubah akun owner lain
    },
  });

  if (!staff) {
    throw new NotFoundException('Staff tidak ditemukan di organisasi Anda');
  }

  // 2. Lakukan Update
  return this.prisma.user.update({
    where: { id: staffId },
    data: {
      name: dto.name,
      role: dto.role,
      is_active: dto.is_active,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      is_active: true,
      updated_at: true,
    },
  });
}
}