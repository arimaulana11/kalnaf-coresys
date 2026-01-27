import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class VoidTransactionDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'Alasan pembatalan minimal 5 karakter' })
  reason: string;
}