import { IsNumber, IsPositive, IsString, IsOptional } from 'class-validator';

export class PayDebtDto {
  @IsNumber()
  @IsPositive()
  amount: number; // Jumlah yang dibayarkan

  @IsString()
  @IsOptional()
  payment_method?: string; // CASH, TRANSFER, dll

  @IsString()
  @IsOptional()
  notes?: string;
}