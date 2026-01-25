import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { ChangePasswordDto } from '../user/dto/change-password.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) { }

  async createStaff(dto: CreateStaffDto, tenantId: string) {
    const existingUser = await this.prisma.users.findUnique({ where: { email: dto.email } });
    if (existingUser) throw new ConflictException('Email already registered');

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    return this.prisma.users.create({
      data: {
        id: uuidv4(),
        name: dto.name,
        email: dto.email,
        password_hash: hashedPassword,
        role: dto.role,
        tenant_id: tenantId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenant_id: true,
        created_at: true,
      },
    });
  }

  async findAllStaff(tenantId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.users.findMany({
        where: { tenant_id: tenantId },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          is_active: true,
          created_at: true,
        },
      }),
      this.prisma.users.count({ where: { tenant_id: tenantId } }),
    ]);

    return {
      items,
      meta: {
        totalItems: total,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    };
  }

  async updateStaff(id: string, dto: UpdateStaffDto, tenantId: string) {
    const user = await this.prisma.users.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!user) throw new NotFoundException('User not found in this tenant');

    return this.prisma.users.update({
      where: { id },
      data: dto,
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

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    // 2. Verifikasi: Apakah password lama sesuai dengan yang di database?
    const isMatch = await bcrypt.compare(dto.oldPassword, user.password_hash);

    if (!isMatch) {
      throw new BadRequestException('Password lama yang Anda masukkan salah');
    }

    // 3. Keamanan: Cek apakah password baru sama dengan password lama
    if (dto.oldPassword === dto.newPassword) {
      throw new BadRequestException('Password baru tidak boleh sama dengan password lama');
    }

    // 4. Hash password baru
    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(dto.newPassword, salt);

    // 5. Update ke database
    await this.prisma.users.update({
      where: { id: userId },
      data: {
        password_hash: newHash,
        updated_at: new Date()
      },
    });

    return {
      success: true,
      message: 'Password berhasil diperbarui',
    };
  }
}