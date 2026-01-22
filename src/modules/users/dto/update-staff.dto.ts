import { IsString, IsEnum, IsBoolean, IsOptional } from 'class-validator';

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(['manager', 'staff'])
  role?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}