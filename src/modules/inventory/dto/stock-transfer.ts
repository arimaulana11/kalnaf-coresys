import { IsNotEmpty, IsNumber, IsString, IsOptional, Min } from 'class-validator';

export class TransferDto {
  @IsNotEmpty()
  @IsNumber()
  variantId: number;

  @IsNotEmpty()
  @IsString()
  toStoreId: string;   // ID Gudang Penerima

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  qty: number;

  @IsOptional()
  @IsString()
  referenceId?: string; // Contoh: Nomor Surat Jalan (SJ-001)

  @IsOptional()
  @IsString()
  notes?: string;       // Contoh: "Kiriman stok mendesak untuk Cabang Bandung"
}