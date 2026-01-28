import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CustomersController } from './customer.controller';
import { CustomersService } from './customer.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, PrismaService],
})
export class CustomersModule {}