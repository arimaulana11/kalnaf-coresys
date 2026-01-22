import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from './database/database.module';
import databaseConfig from './config/database.config';

import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module'
import { UsersModule } from './modules/users/users.module'
import { StoresModule } from './modules/stores/stores.module'

import { AuthMiddleware } from './common/middleware/auth.middleware';
import { TenantMiddleware } from './common/middleware/tenant.middleware';


@Module({
  imports: [HealthModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
      envFilePath: '.env', // Pastikan path file .env benar
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    StoresModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secret',
      signOptions: { expiresIn: '15m' },
    }),
  ],
})

export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware, TenantMiddleware)
      .exclude(
        // Gunakan path eksplisit (paling aman)
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'auth/register', method: RequestMethod.POST },
        { path: 'auth/refresh', method: RequestMethod.POST },
        { path: 'health', method: RequestMethod.GET },
      )
      // Gunakan *path (bukan hanya *)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}