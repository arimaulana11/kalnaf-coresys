import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any) {
    // Jika ada error atau user tidak ditemukan dalam token
    if (err || !user) {
      throw err || new UnauthorizedException('Anda tidak memiliki akses (Token tidak valid)');
    }
    return user;
  }
}