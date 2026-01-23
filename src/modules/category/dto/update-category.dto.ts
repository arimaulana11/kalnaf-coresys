import { PartialType } from '@nestjs/mapped-types';
import { CreateCategoryDto } from './create-category.dto';

// PartialType akan membuat semua properti dari CreateCategoryDto 
// menjadi opsional (@IsOptional) namun tetap menjaga validasi tipe datanya.
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}