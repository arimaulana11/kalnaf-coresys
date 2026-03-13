import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail({}, { message: 'Format email tidak valid' })
  @IsNotEmpty({ message: 'Email tidak boleh kosong' })
  email: string;

  @IsString({ message: 'OTP harus berupa string' })
  @IsNotEmpty({ message: 'Kode OTP tidak boleh kosong' })
  @Length(6, 6, { message: 'Kode OTP harus tepat 6 digit' })
  otp: string;
}