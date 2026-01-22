import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(['staff', 'manager'])
  role?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}