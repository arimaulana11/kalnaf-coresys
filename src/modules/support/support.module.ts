import { Module } from '@nestjs/common';
import { SupportService } from './support.service';
import { SupportController } from './support.controller';

@Module({
  controllers: [SupportController],
  providers: [SupportService],
  exports: [SupportService], // Opsional, jika ingin digunakan di module lain
})
export class SupportModule {}