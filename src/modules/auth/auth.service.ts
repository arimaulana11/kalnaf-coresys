import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Response } from 'express';


@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) { }

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) throw new ConflictException('Email sudah terdaftar');

    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(dto.password, salt);

    // Transaction: Membuat Tenant baru sekaligus Owner-nya
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.name, plan: 'basic' },
      });

      const store = await tx.store.create({
        data: { tenant_id: tenant.id, name: dto.store_name },
      });

      const user = await tx.user.create({
        data: {
          tenant_id: tenant.id,
          name: dto.name,
          email: dto.email,
          password_hash: hashedPassword,
          role: 'owner',
        },
      });

      const _ = await tx.userStore.create({
        data: {
          store_id: store.id,
          user_id: user.id,
          status: "active",
        },
      });

      return {
        message: 'Registrasi berhasil',
        tenantId: tenant.id,
        userId: user.id,
      };
    });
  }

  async login(dto: LoginDto, res: Response) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.password_hash))) {
      throw new UnauthorizedException('Kredensial tidak valid');
    }

    const payload = {
      sub: user.id,
      tenantId: user.tenant_id,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '15m',
    });

    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id },
      { expiresIn: '7d' },
    );

    // 🔐 HASH refresh token
    const tokenHash = await bcrypt.hash(refreshToken, 10);

    await this.prisma.refreshToken.create({
      data: {
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // 🍪 SET COOKIE
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return { access_token: accessToken };
  }

  async refreshToken(oldToken: string, res: Response) {
    if (!oldToken) {
      throw new UnauthorizedException('Refresh token tidak ada');
    }

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(oldToken);
    } catch {
      throw new UnauthorizedException('Refresh token invalid');
    }

    const storedTokens = await this.prisma.refreshToken.findMany({
      where: { user_id: payload.sub },
    });

    // 🔍 Cocokkan HASH
    const validToken = await Promise.any(
      storedTokens.map(rt => bcrypt.compare(oldToken, rt.token_hash)),
    ).catch(() => null);

    if (!validToken) {
      // 🚨 TOKEN REUSE ATTACK → revoke semua
      await this.prisma.refreshToken.deleteMany({
        where: { user_id: payload.sub },
      });

      throw new UnauthorizedException('Refresh token reuse terdeteksi');
    }

    // 🔥 ROTATION: hapus token lama
    await this.prisma.refreshToken.deleteMany({
      where: { user_id: payload.sub },
    });

    // 🔁 generate token baru
    const newAccessToken = await this.jwtService.signAsync(
      { sub: payload.sub },
      { expiresIn: '15m' },
    );

    const newRefreshToken = await this.jwtService.signAsync(
      { sub: payload.sub },
      { expiresIn: '7d' },
    );

    const newHash = await bcrypt.hash(newRefreshToken, 10);

    await this.prisma.refreshToken.create({
      data: {
        user_id: payload.sub,
        token_hash: newHash,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // 🍪 UPDATE COOKIE
    res.cookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      access_token: newAccessToken,
    };
  }

  async logout(res: Response) {
    // Hapus cookie refresh token
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh',
    });

    return {
      message: 'Logout berhasil',
    };
  }
}
