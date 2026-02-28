import { StockLogType } from '@prisma/client';
import { IsNumber, IsString, IsEnum, IsOptional, IsNotEmpty, Min } from 'class-validator';

export class StockOutDto {
  @IsNumber()
  @IsNotEmpty()
  variantId: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  qty: number;

  @IsEnum(['WASTE', 'EXPIRED', 'DAMAGE', 'LOST'], {
    message: 'Tipe harus salah satu dari: WASTE, EXPIRED, LOST atau DAMAGE'
  })
  @IsNotEmpty()
  type: StockLogType;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}