import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // Membuat PrismaService tersedia di seluruh aplikasi tanpa perlu import manual di setiap modul
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}