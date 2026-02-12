import { Type } from 'class-transformer';
import { IsString, IsOptional, IsNumber, Min, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { CreateComponentDto } from './component-product.dto';

export class CreateVariantDto {
  @IsOptional() // <-- Ini kuncinya
  id?: number;
  
  @IsString()
  name: string; // Contoh: "No 40 - Merah"

  @IsOptional()
  @IsString()
  sku: string;

  @IsString()
  unitName: string; // Contoh: "Pcs" atau "Pasang"

  @IsNumber()
  @Min(1)
  multiplier: number; // 1 untuk unit dasar

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsBoolean()
  isBaseUnit?: boolean; 

  @IsOptional()
  @IsNumber()
  @Min(0)
  initialStock?: number; // Untuk request "Sepatu": stok per varian

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateComponentDto)
  components?: CreateComponentDto[];

  @IsOptional()
  @IsString()
  parentSku?: string; // <--- Tambahkan ini
}