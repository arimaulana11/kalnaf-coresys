import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CreateSupportDto { // <--- Pastikan ada kata 'export'
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  whatsapp: string;

  @IsString()
  @IsNotEmpty()
  description: string;
}