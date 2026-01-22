import { IsUUID, IsNotEmpty } from 'class-validator';

export class AssignStaffDto {
  @IsUUID()
  @IsNotEmpty()
  user_id: string;
}