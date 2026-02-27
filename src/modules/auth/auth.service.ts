import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
    ) { }

    async register(dto: RegisterDto) {
        const existingUser = await this.prisma.users.findUnique({ where: { email: dto.email } });
        if (existingUser) throw new ConflictException('Email sudah terdaftar');

        const hashedPassword = await bcrypt.hash(dto.password, 10);

        // Menggunakan Prisma Transaction agar Tenant, User, dan Store dibuat sekaligus
        return await this.prisma.$transaction(async (tx) => {
            const tenant = await tx.tenants.create({
                data: { id: uuidv4(), name: dto.tenant_name },
            });

            const user = await tx.users.create({
                data: {
                    id: uuidv4(),
                    tenantId: tenant.id,
                    name: dto.name,
                    email: dto.email,
                    passwordHash: hashedPassword,
                    role: 'owner',
                },
            });

            await tx.stores.create({
                data: {
                    id: uuidv4(),
                    tenantId: tenant.id,
                    name: dto.store_name,
                    updatedAt: new Date(),
                },
            });

            return {
                message: "Registrasi berhasil", // Ini akan ditangkap interceptor
                tenantId: user.tenantId,
                userId: user.id,
            };
        });
    }

    async login(dto: LoginDto) {
        const user = await this.prisma.users.findUnique({ where: { email: dto.email } });
        if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
            throw new UnauthorizedException('Email atau password salah');
        }

        const payload = { sub: user.id, tenantId: user.tenantId, role: user.role };

        const accessToken = this.jwtService.sign(payload);
        const refreshToken = uuidv4(); // Sesuai skema refresh_tokens Anda

        // Simpan refresh token ke database
        await this.prisma.refresh_tokens.create({
            data: {
                id: uuidv4(),
                userId: user.id,
                tokenHash: await bcrypt.hash(refreshToken, 10),
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 hari
            },
        });

        return {
            access_token: accessToken
        };
    }

    async refresh(refreshToken: string) {
        // ... logika mencari tokenData ...
        const tokenData = await this.prisma.refresh_tokens.findFirst({
            where: { expiresAt: { gt: new Date() } }
            // Tambahkan logika identifikasi token yang spesifik jika memungkinkan
        });

        if (!tokenData) throw new UnauthorizedException('Invalid token');

        const user = await this.prisma.users.findUnique({
            where: { id: tokenData.userId }
        });

        // PROTEKSI: Cek apakah user ada
        if (!user) {
            throw new UnauthorizedException('User no longer exists');
        }

        // Sekarang aman, TypeScript tahu 'user' tidak null
        const payload = {
            sub: user.id,
            tenantId: user.tenantId,
            role: user.role
        };

        return {
            access_token: this.jwtService.sign(payload),
        };
    }

    async logout(refreshToken: string) {
        if (refreshToken) {
            // Hapus dari database agar tidak bisa digunakan lagi
            // Kita gunakan deleteMany karena kita mencari berdasarkan hash (perlu hati-hati dengan performa)
            await this.prisma.refresh_tokens.deleteMany({
                where: {
                    // Logika pencarian token yang akan dihapus
                }
            });
        }
        return { message: 'Logout berhasil' };
    }
}