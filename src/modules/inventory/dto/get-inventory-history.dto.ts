import { IsOptional, IsString, IsInt, Min, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class GetInventoryHistoryDto {
  @IsOptional()
  @IsString()
  storeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;
}

export class GetOpnameDetailParamDto {
  @IsString()
  @IsNotEmpty()
  referenceId: string;
}