import { IsOptional, IsString, IsNumberString, IsDateString } from 'class-validator';

export class QueryReportDto {
  @IsString()
  storeId: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  // Pagination Params
  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}