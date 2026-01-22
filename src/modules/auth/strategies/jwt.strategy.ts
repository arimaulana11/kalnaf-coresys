import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'secretKey', // Pastikan sama dengan di AppModule
    });
  }

  async validate(payload: any) {
    // Data yang di-return di sini akan masuk ke req.user
    return { 
      userId: payload.sub, 
      tenantId: payload.tenantId, 
      role: payload.role 
    };
  }
}