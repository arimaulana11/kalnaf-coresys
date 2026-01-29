import { IsUUID, IsNotEmpty } from 'class-validator';

export class GetCurrentShiftDto {
  @IsUUID()
  @IsNotEmpty()
  storeId: string;
}