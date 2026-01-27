import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class TransactionItemDto {
  @IsInt()
  @IsNotEmpty()
  variantId: number;

  @IsInt()
  @IsNotEmpty()
  qty: number;

  @IsInt()
  @IsNotEmpty()
  price: number;

  @IsOptional()
  @IsInt()
  discount?: number;
}

export class CreateTransactionDto {
  @IsUUID()
  @IsNotEmpty()
  storeId: string;

  @IsString()
  @IsNotEmpty()
  paymentMethod: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionItemDto)
  items: TransactionItemDto[];

  @IsInt()
  @IsNotEmpty()
  totalAmount: number;

  @IsInt()
  @IsNotEmpty()
  paidAmount: number;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsInt()
  totalDiscount?: number;
}