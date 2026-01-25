import { Type } from 'class-transformer';
import { IsString, IsOptional, IsNumber, Min, IsInt, IsArray, ValidateNested } from 'class-validator';

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  notes?: string; // Untuk audit log alasan perubahan
}

class ParcelComponentDto {
  @IsInt()
  componentVariantId: number;

  @IsInt()
  @Min(1)
  qty: number;
}

export class UpdateParcelDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParcelComponentDto)
  components: ParcelComponentDto[];
}