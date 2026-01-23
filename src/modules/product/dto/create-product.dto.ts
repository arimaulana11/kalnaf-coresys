import { IsString, IsNotEmpty, IsEnum, IsArray, ValidateNested, IsNumber, IsBoolean, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class VariantDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() unit_name: string;
  @IsNumber() multiplier: number;
  @IsBoolean() is_base_unit: boolean;
  @IsNumber() price: number;
  @IsString() @IsNotEmpty() sku: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ComponentDto)
  components?: ComponentDto[];
}

class ComponentDto {
  @IsNumber() component_variant_id: number;
  @IsNumber() qty: number;
}

export class CreateProductDto {
  @IsNumber() category_id: number;
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsOptional() description?: string;
  
  @IsEnum(['PHYSICAL', 'PARCEL'])
  type: 'PHYSICAL' | 'PARCEL';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  variants: VariantDto[];
}