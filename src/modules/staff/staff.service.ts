import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) { }

  // Logika khusus untuk endpoint search (berdasarkan nama atau email)
  async search(tenantId: string, query?: string) {
    return this.prisma.users.findMany({
      where: {
        tenantId: tenantId,
        OR: query ? [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ] : undefined,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true }
    });
  }

  async create(dto: CreateStaffDto, tenantId: string) {
    // Cek email duplikat
    const existing = await this.prisma.users.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email sudah terdaftar');

    const { password, ...rest } = dto;
    const hashedPassword = await bcrypt.hash(password, 10);

    return this.prisma.users.create({
      data: {
        ...rest,
        id: uuidv4(),
        tenantId: tenantId,
        passwordHash: hashedPassword,
        isActive: true,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true }
    });
  }

  async findAll(tenantId: string, page: number = 1, limit: number = 10) {
    // 1. Hitung berapa data yang harus dilewati
    const skip = (page - 1) * limit;

    // 2. Jalankan query secara paralel untuk efisiensi
    const [data, total] = await Promise.all([
      this.prisma.users.findMany({
        where: {
          tenantId: tenantId,
          // Optional: Jika kamu ingin memfilter agar user yang login tidak muncul di daftar
          // id: { not: currentUserId } 
        },
        skip: skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        // Pilih field yang diperlukan saja (jangan kirim password!)
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true
        }
      }),
      this.prisma.users.count({
        where: { tenantId: tenantId },
      }),
    ]);

    // 3. Hitung total halaman
    const lastPage = Math.ceil(total / limit);

    // 4. Return data dengan struktur meta
    return {
      data, // Ini akan menjadi response.data.data.data di frontend
      meta: {
        total,
        page,
        lastPage,
        limit,
      },
    };
  }

  async findOne(id: string, tenantId: string) {
    const staff = await this.prisma.users.findFirst({
      where: { id, tenantId: tenantId },
    });
    if (!staff) throw new NotFoundException('Staff not found');
    return staff;
  }

  async update(id: string, dto: UpdateStaffDto, tenantId: string) {
    await this.findOne(id, tenantId);

    const data: any = { ...dto };
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
      delete data.password;
    }

    return this.prisma.users.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, isActive: true }
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.users.delete({
      where: { id },
    });
  }

  async updateStatus(id: string, tenantId: string, isActive: boolean) {
    await this.findOne(id, tenantId);

    return this.prisma.users.update({
      where: { id },
      data: { isActive: isActive },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        updatedAt: true
      },
    });
  }
}