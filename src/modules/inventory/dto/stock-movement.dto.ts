import { Type } from "class-transformer";
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min, ValidateNested } from "class-validator";

export class StockTransferDto {
  @IsUUID()
  @IsNotEmpty()
  fromStoreId: string;

  @IsUUID()
  @IsNotEmpty()
  toStoreId: string;

  @IsInt()
  @IsNotEmpty()
  variantId: number;

  @IsInt()
  @Min(1)
  qty: number;

  @IsString()
  @IsOptional()
  note?: string;
}
