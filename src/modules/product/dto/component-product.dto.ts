import { IsNumber, Min } from 'class-validator';

// DTO untuk Komponen
export class CreateComponentDto {
  @IsNumber()
  componentVariantId: number;

  @IsNumber()
  @Min(1)
  qty: number;
}