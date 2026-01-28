import { IsEmail, IsNotEmpty, IsOptional, IsString, IsObject } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsObject()
  @IsOptional()
  metadata?: any;
}

export class UpdateCustomerDto extends CreateCustomerDto {}