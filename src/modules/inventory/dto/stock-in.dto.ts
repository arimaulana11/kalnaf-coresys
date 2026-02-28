import { IsInt, IsString, IsOptional, Min, IsNotEmpty, IsUUID } from 'class-validator';

export class StockInDto {
  @IsInt()
  @IsNotEmpty()
  variantId: number;

  @IsInt()
  @Min(1)
  qty: number;

  @IsString()
  @IsOptional()
  notes?: string;

  // Opsional: Jika ingin mencatat harga beli saat restock
  @IsInt()
  @IsOptional()
  purchasePrice?: number;

  // Tambahkan ini agar tidak kena error "should not exist"
  @IsString()
  @IsOptional()
  note?: string;

  @IsString()
  @IsOptional()
  receivedFrom?: string;

  // Jika Anda mengirim storeId di BODY (bukan di Header)
  @IsOptional()
  referenceId?: string;

  @IsUUID()
  @IsOptional()
  supplierId?: string;
}