import { IsString, IsOptional } from 'class-validator';

export class CategoryQueryDto {
  @IsString()
  @IsOptional()
  name?: string;
}