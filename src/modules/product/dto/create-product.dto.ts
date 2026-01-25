import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, IsEnum, IsDateString, IsUUID, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductType } from '@prisma/client';
import { CreateVariantDto } from './varian-product.dto'; // pastikan path benar

class InitialStockDto {
  @IsUUID('4', { message: 'storeId harus format UUID yang valid' })
  storeId: string;

  @IsNumber()
  qty: number;

  @IsNumber()
  purchasePrice: number;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

export class CreateProductDto {
  @IsNumber()
  categoryId: number;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(ProductType)
  type: ProductType; // PHYSICAL atau DIGITAL

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants: CreateVariantDto[];

  // OPSI 1: Stok via Array (Beras Ramos Style)
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InitialStockDto)
  initialStocks?: InitialStockDto[];

  // OPSI 2: Metadata Stok Root (Sepatu Adidas Style)
  // Digunakan bersama initialStock di dalam variants
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsNumber()
  purchasePrice?: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  taxIds?: number[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean; // Tambahkan baris ini
}
