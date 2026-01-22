import {
  Injectable,
  NestMiddleware,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const user = (req as any).user;

    // 1. Jika tidak ada user atau tenantId (misal: route login/public), 
    // langsung lanjut ke next(). Jangan dilempar error di sini.
    if (!user || !user.tenantId) {
      return next();
    }

    // 2. Jika ada tenantId di token, validasi statusnya di database
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
    });

    // 3. Jika tenant tidak ditemukan di DB atau tidak aktif
    if (!tenant) {
      throw new ForbiddenException('Tenant tidak ditemukan atau tidak valid');
    }

    if (!tenant.is_active) {
      throw new UnauthorizedException('Tenant sedang tidak aktif (suspend)');
    }

    // 4. Tempelkan data tenant ke request agar bisa dipakai di controller
    (req as any).tenant = tenant;
    
    next();
  }
}