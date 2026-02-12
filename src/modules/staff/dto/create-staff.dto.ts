// backend: src/modules/staff/dto/create-staff.dto.ts
import { IsEmail, IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';

export class CreateStaffDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsEnum(['owner', 'manager', 'staff'])
  role: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean; // Tambahkan ini agar tidak kena error 400
}