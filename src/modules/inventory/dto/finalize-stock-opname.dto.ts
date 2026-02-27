import { IsInt, IsNotEmpty, IsOptional, IsString, Min, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class StockOpnameItemDto {
  @IsInt()
  @IsNotEmpty()
  variantId: number;

  @IsInt()
  @Min(0)
  @IsNotEmpty()
  actualQty: number;

  @IsString()
  @IsOptional()
  note?: string; 
}

export class FinalizeStockOpnameDto {
  @IsUUID()
  @IsNotEmpty()
  storeId: string;

  @IsString()
  @IsNotEmpty()
  auditorName: string; // Kamu tadi kirim 'auditor', ubah jadi 'auditorName' di Postman

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockOpnameItemDto)
  items: StockOpnameItemDto[];
}