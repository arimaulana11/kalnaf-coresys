import { IsOptional, IsString, IsEnum, IsNumberString, IsBooleanString } from 'class-validator';

export enum ProductType {
  PHYSICAL = 'PHYSICAL',
  PARCEL = 'PARCEL',
  DIGITAL = 'DIGITAL',
}

export class GetVariantsFilterDto {
  @IsOptional()
  @IsString()
  search?: string; // Filter SKU atau Nama

  @IsOptional()
  @IsString()
  storeId?: string; // Filter berdasarkan lokasi toko

  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType; // Filter berdasarkan tipe produk

  @IsOptional()
  @IsBooleanString()
  isActive?: string;

  @IsOptional()
  @IsNumberString()
  page?: string = '1';

  @IsOptional()
  @IsNumberString()
  limit?: string = '10';
}