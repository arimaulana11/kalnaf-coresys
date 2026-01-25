import { IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class ProductIdParamDto {
  @IsInt()
  @Type(() => Number)
  id: number;
}