import { Injectable, ConflictException, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { MailService } from '../../mail/mail.service';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private mailService: MailService,
    ) { }

    async register(dto: RegisterDto) {
        const existingUser = await this.prisma.users.findUnique({ where: { email: dto.email } });
        if (existingUser) throw new ConflictException('Email sudah terdaftar');

        const hashedPassword = await bcrypt.hash(dto.password, 10);

        // Menggunakan Prisma Transaction agar Tenant, User, dan Store dibuat sekaligus
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);

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
                    isVerified: false,
                    verificationOtp: otp,
                    otpExpiresAt: expiresAt
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

            // Buat Link Verifikasi (Arahkan ke Frontend Anda)

            await this.mailService.sendSystemEmail(
                dto.email,
                'Verifikasi Email Kalnaf',
                'verifyEmail',
                {
                    name: dto.name,
                    otp_code: otp, // Kirim variabel ini ke template .hbs
                },
            );

            return {
                message: "Registrasi berhasil, Kode OTP telah dikirim ke email Anda.", // Ini akan ditangkap interceptor
                tenantId: user.tenantId,
                userId: user.id,
            };
        });
    }

    async verifyOtp(dto: VerifyOtpDto) {
        const { email, otp } = dto;

        const user = await this.prisma.users.findFirst({
            where: {
                email,
                verificationOtp: otp,
                otpExpiresAt: {
                    gt: new Date(),
                },
            },
        });

        if (!user) {
            throw new BadRequestException('Kode OTP salah atau sudah kadaluwarsa.');
        }

        await this.prisma.users.update({
            where: { id: user.id },
            data: {
                isVerified: true,
                verificationOtp: null,
                otpExpiresAt: null,
            },
        });

        return {
            statusCode: 200,
            message: 'Akun berhasil diverifikasi. Silakan login.',
        };
    }

    async resendOtp(email: string) {
        // 1. Cari user berdasarkan email
        const user = await this.prisma.users.findUnique({
            where: { email }
        });

        // 2. Validasi dasar
        if (!user) {
            throw new NotFoundException('User tidak ditemukan');
        }
        if (user.isVerified) {
            throw new BadRequestException('Email sudah terverifikasi, silakan login');
        }

        const now = new Date();

        // 3. PROTEKSI: Cek apakah OTP lama masih aktif
        if (user.otpExpiresAt && user.otpExpiresAt > now) {
            // Hitung selisih waktu dalam milidetik, lalu konversi ke menit
            const diffInMs = user.otpExpiresAt.getTime() - now.getTime();
            const diffInMinutes = Math.ceil(diffInMs / 60000);

            throw new BadRequestException(
                `OTP Anda masih aktif. Silakan cek inbox atau coba lagi dalam ${diffInMinutes} menit.`
            );
        }

        // 4. Jika sudah expired, generate OTP baru
        const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10); // Masa berlaku 10 menit

        // 5. Update data di database
        await this.prisma.users.update({
            where: { email },
            data: {
                verificationOtp: newOtp,
                otpExpiresAt: expiresAt,
            },
        });

        // 6. Kirim email
        await this.mailService.sendSystemEmail(
            email,
            'Kode Verifikasi Baru - Kalnaf',
            'verifyEmail',
            {
                name: user.name,
                otp_code: newOtp,
            },
        );

        return {
            message: "Kode OTP baru telah dikirim ke email Anda.",
        };
    }

    async login(dto: LoginDto) {
        const user = await this.prisma.users.findUnique({ where: { email: dto.email, isVerified: true, isActive: true } });
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