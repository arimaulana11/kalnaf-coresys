import { IsString, IsNumber, IsNotEmpty, Min, IsOptional } from 'class-validator';

export class OpenShiftDto {
  @IsString()
  @IsNotEmpty()
  storeId: string;

  @IsNumber()
  @Min(0)
  startingCash: number;
}

export class CloseShiftDto {
  @IsString()
  @IsNotEmpty()
  shiftId: string;

  @IsNumber()
  @Min(0)
  actualCash: number; // Uang fisik yang dihitung kasir

  @IsString()
  @IsOptional()
  note?: string;
}