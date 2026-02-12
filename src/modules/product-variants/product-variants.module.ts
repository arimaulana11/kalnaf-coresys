import { Module } from '@nestjs/common';
import { ProductVariantsService } from './product-variants.service';
import { VariantsController } from './product-variants.controller';

@Module({
  controllers: [VariantsController],
  providers: [ProductVariantsService],
})
export class ProductVariantsModule {}
