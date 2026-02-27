import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class GetStockOpnameProductsDto {
    @IsOptional()
    @IsString()
    search?: string;

    @IsNotEmpty() // Wajibkan storeId agar tidak undefined
    @IsString()
    storeId: string;

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