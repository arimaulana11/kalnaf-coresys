import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString() @IsNotEmpty()
  tenant_name: string;

  @IsString() @IsNotEmpty()
  store_name: string;

  @IsString() @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString() @MinLength(6)
  password: string;
}