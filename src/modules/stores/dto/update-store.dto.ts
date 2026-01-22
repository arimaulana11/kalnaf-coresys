import { PartialType } from '@nestjs/mapped-types';
import { CreateStoreDto } from './create-store.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateStoreDto extends PartialType(CreateStoreDto) {
  @IsOptional()
  @IsBoolean({ message: 'Status aktif harus berupa boolean (true/false)' })
  is_active?: boolean;
}