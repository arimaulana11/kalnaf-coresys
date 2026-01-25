import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from "class-validator";

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

export class StockOpnameDto {
  @IsInt()
  @IsNotEmpty()
  variantId: number;

  @IsInt()
  @Min(0)
  @IsNotEmpty()
  actualQty: number; // Angka fisik yang dihitung di gudang

  @IsString()
  @IsOptional()
  note?: string;
}