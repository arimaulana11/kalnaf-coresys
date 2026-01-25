// src/products/dto/import-product.dto.ts
import { IsString, IsNumber, IsOptional, IsEnum, IsArray, ValidateNested, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductType } from '@prisma/client';

class ImportVariantDto {
  @IsString()
  sku: string;

  @IsString()
  unitName: string;

  @IsInt()
  @Min(0)
  price: number;

  @IsInt()
  @Min(1)
  multiplier: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  initialStock?: number;
}

export class ImportProductDto {
  @IsString()
  name: string;

  @IsInt()
  categoryId: number;

  @IsEnum(ProductType)
  @IsOptional()
  type?: ProductType = ProductType.PHYSICAL;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportVariantDto)
  variants: ImportVariantDto[];
}