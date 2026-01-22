import {
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private jwtService: JwtService) { }

  async use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    const publicPaths = ['/auth/login', '/auth/register', '/health'];
    if (publicPaths.some(path => req.originalUrl.includes(path))) {
      return next();
    }

    // JANGAN THROW ERROR DI SINI
    // Jika tidak ada header, biarkan lewat ke Guard
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return next();
    }

    try {
      // Verifikasi token
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'secret', // Pastikan secret sama dengan saat login
      });

      // Tempelkan data user ke request agar bisa dipakai di controller/middleware selanjutnya
      req['user'] = payload;

      next();
    } catch (error) {
      // Jika token ada tapi rusak/expired, baru boleh throw error
      // Atau bisa juga cukup next() dan biarkan Guard yang menangani 401
      next();
    }
  }
}