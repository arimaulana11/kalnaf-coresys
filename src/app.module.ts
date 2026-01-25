import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import jwtConfig from './config/jwt.config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { StoresModule } from './modules/stores/stores.module';
// import { HealthModule } from './modules/health/health.module';
import { CategoryModule } from './modules/category/category.module';
import { ProductModule } from './modules/product/product.module';
import databaseConfig from './config/database.config';
import { InventoryModule } from './modules/inventory/inventory.module';

@Module({
  imports: [
    // Load Config Global
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig],
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    StoresModule,
    CategoryModule,
    ProductModule,
    InventoryModule,
    // HealthModule,
  ],
})
export class AppModule {}