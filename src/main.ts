import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. Set Global Prefix (Sesuai Postman: /api/auth/...)
  app.setGlobalPrefix('api');

  // 2. Gunakan Cookie Parser (Untuk refresh_token di Postman)
  app.use(cookieParser());

  // 3. Global Interceptor (Bungkus response jadi {success, statusCode, data})
  app.useGlobalInterceptors(new TransformInterceptor());

  // 4. Global Validation (Validasi DTO otomatis)
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // 5. Enable CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Kalnaf-coresys is running on: http://localhost:${port}/api`);
}
bootstrap();