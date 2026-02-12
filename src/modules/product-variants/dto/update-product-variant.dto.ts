import { PartialType } from '@nestjs/mapped-types';
import { CreateProductVariantDto } from './create-product-variant.dto';
import { IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// Kita buat DTO kecil untuk item komponennya
export class VariantComponentDto {
  @IsNumber()
  componentVariantId: number;

  @IsNumber()
  qty: number;
}

export class UpdateProductVariantDto extends PartialType(CreateProductVariantDto) {
  @IsOptional()
  @IsNumber()
  id?: number; // Tambahkan ini agar error "id should not exist" hilang

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantComponentDto)
  components?: VariantComponentDto[]; // Tambahkan ini agar backend mengenali data komponen
}