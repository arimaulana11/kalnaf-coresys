import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateStoreDto {
  @IsString()
  @IsNotEmpty({ message: 'Nama toko tidak boleh kosong' })
  @MaxLength(150, { message: 'Nama toko maksimal 150 karakter' })
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Nomor telepon maksimal 20 karakter' })
  phone?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Logo harus berupa URL yang valid' })
  logo_url?: string;

  @IsOptional()
  @IsString()
  receipt_header?: string;

  @IsOptional()
  @IsString()
  receipt_footer?: string;
}