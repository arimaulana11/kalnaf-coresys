import { Controller, Post, Body, Res, Req, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Request, Response } from 'express'; // Pastikan import dari 'express'

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register')
    async register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Post('login')
    async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
        const result = await this.authService.login(dto);

        // 1. Perbaikan: Gunakan result.refresh_token (bukan access_token) untuk cookie
        res.cookie('refresh_token', result.access_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        // 2. Perbaikan: Kita ingin access_token TAMPIL di body, tapi refresh_token DISEMBUNYIKAN
        const { ...responseVisibleData } = result;

        // 3. Kembalikan data murni. 
        // Interceptor akan otomatis membungkusnya menjadi { success, statusCode, message, data: { access_token } }
        return responseVisibleData;
    }

@Post('refresh')
  async refresh(@Req() req: Request) { // Request dari express punya property cookies
    const refreshToken = req.cookies['refresh_token'];
    if (!refreshToken) throw new UnauthorizedException('Refresh token not found');
    
    return this.authService.refresh(refreshToken);
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies['refresh_token'];
    
    await this.authService.logout(refreshToken);

    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    return { message: 'Logout berhasil' };
  }
}