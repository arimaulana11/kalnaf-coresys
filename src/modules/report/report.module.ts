import { Module } from '@nestjs/common';
import { ReportsService } from './report.service';
import { ReportsController } from './report.controller';

@Module({
  providers: [ReportsService],
  controllers: [ReportsController]
})
export class ReportModule {}
