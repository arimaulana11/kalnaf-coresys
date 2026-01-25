import { IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class VariantIdParamDto {
  @IsInt()
  @Type(() => Number)
  id: number;
}