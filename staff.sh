#!/bin/bash

# 1. Tentukan path modul
MODULE_PATH="src/modules/staff"

# 2. Buat direktori yang diperlukan
mkdir -p "$MODULE_PATH/dto"

# 3. Buat file DTO untuk Create
cat <<EOF > "$MODULE_PATH/dto/create-staff.dto.ts"
import { IsEmail, IsEnum, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateStaffDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6, { message: 'Password minimal 6 karakter' })
  password: string;

  @IsEnum(['owner', 'manager', 'staff'])
  role: string;
}
EOF

# 4. Buat file DTO untuk Update
cat <<EOF > "$MODULE_PATH/dto/update-staff.dto.ts"
import { PartialType } from '@nestjs/mapped-types';
import { CreateStaffDto } from './create-staff.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateStaffDto extends PartialType(CreateStaffDto) {
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
EOF

# 5. Buat Service (Logika CRUD + Hashing + Tenant Isolation)
cat <<EOF > "$MODULE_PATH/staff.service.ts"
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateStaffDto) {
    const existing = await this.prisma.users.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email sudah terdaftar');

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    return this.prisma.users.create({
      data: {
        id: uuidv4(),
        tenant_id: tenantId,
        name: dto.name,
        email: dto.email,
        password_hash: hashedPassword,
        role: dto.role,
        is_active: true,
      },
      select: { id: true, name: true, email: true, role: true, is_active: true, created_at: true }
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.users.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
      select: { id: true, name: true, email: true, role: true, is_active: true, created_at: true }
    });
  }

  async findOne(tenantId: string, id: string) {
    const user = await this.prisma.users.findFirst({
      where: { id, tenant_id: tenantId }
    });
    if (!user) throw new NotFoundException('Staff tidak ditemukan');
    return user;
  }

  async update(tenantId: string, id: string, dto: UpdateStaffDto) {
    await this.findOne(tenantId, id);

    const data: any = { ...dto };
    if (dto.password) {
      data.password_hash = await bcrypt.hash(dto.password, 10);
      delete data.password;
    }

    return this.prisma.users.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, is_active: true }
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.users.delete({ where: { id } });
  }
}
EOF

# 6. Buat Controller
cat <<EOF > "$MODULE_PATH/staff.controller.ts"
import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';

@Controller('staff')
@UseGuards(JwtAuthGuard)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  create(@Request() req, @Body() createStaffDto: CreateStaffDto) {
    return this.staffService.create(req.user.tenantId, createStaffDto);
  }

  @Get()
  findAll(@Request() req) {
    return this.staffService.findAll(req.user.tenantId);
  }

  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.staffService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  update(@Request() req, @Param('id') id: string, @Body() updateStaffDto: UpdateStaffDto) {
    return this.staffService.update(req.user.tenantId, id, updateStaffDto);
  }

  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.staffService.remove(req.user.tenantId, id);
  }
}
EOF

# 7. Buat Module
cat <<EOF > "$MODULE_PATH/staff.module.ts"
import { Module } from '@nestjs/common';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';

@Module({
  controllers: [StaffController],
  providers: [StaffService],
})
export class StaffModule {}
EOF

echo "✅ Backend Staff Module berhasil dibuat di $MODULE_PATH"