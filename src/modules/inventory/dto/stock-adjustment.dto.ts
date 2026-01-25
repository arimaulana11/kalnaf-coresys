 
import { IsInt, IsString, IsNotEmpty } from 'class-validator';

export class StockAdjustmentDto {
  @IsInt()
  @IsNotEmpty()
  variantId: number;

  @IsInt()
  @IsNotEmpty()
  // Bisa positif (menambah) atau negatif (mengurangi karena rusak/hilang)
  adjustmentQty: number;

  @IsString()
  @IsNotEmpty()
  reason: string; // Wajib diisi untuk audit trail

  @IsString()
  @IsNotEmpty()
  type: string; // Tambahkan ini (misal: DAMAGED, LOST, CORRECTION)
}