import { IsNotEmpty, IsString, IsOptional, IsUrl } from 'class-validator';

export class CreateStoreDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  receipt_header?: string;

  @IsString()
  @IsOptional()
  receipt_footer?: string;

  @IsOptional()
  @IsString() // Bisa gunakan @IsUrl() jika ingin validasi URL ketat
  logo_url?: string;
}