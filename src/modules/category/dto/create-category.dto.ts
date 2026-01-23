import { IsString, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString({ message: 'Nama kategori harus berupa teks' })
  @IsNotEmpty({ message: 'Nama kategori tidak boleh kosong' })
  @MinLength(3, { message: 'Nama kategori minimal 3 karakter' })
  name: string;

  @IsString({ message: 'Deskripsi harus berupa teks' })
  @IsOptional()
  description?: string;
}