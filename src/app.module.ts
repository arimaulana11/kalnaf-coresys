import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import jwtConfig from './config/jwt.config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { StoresModule } from './modules/stores/stores.module';
import { HealthController } from './health.controller';
import { CategoryModule } from './modules/category/category.module';
import { ProductModule } from './modules/product/product.module';
import databaseConfig from './config/database.config';
import { InventoryModule } from './modules/inventory/inventory.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { ReportModule } from './modules/report/report.module';
import { CustomersModule } from './modules/customer/customer.module';
import { ProductVariantsModule } from './modules/product-variants/product-variants.module';

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
    TransactionsModule,
    CustomersModule,
    ReportModule,
    ProductVariantsModule,
  ],
  controllers: [
    HealthController, // DIPINDAHKAN ke sini
  ],
})
export class AppModule {}