import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs/operators';

@Injectable()
export class PrismaSerializeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map((data) => {
        // 1. TAMBAHKAN PENGECEKAN INI:
        // Jika data kosong, null, atau undefined, langsung kembalikan agar tidak error
        if (!data) return data;

        // 2. Gunakan try-catch agar aplikasi tidak crash jika ada error parsing lainnya
        try {
          return JSON.parse(
            JSON.stringify(data, (key, value) =>
              typeof value === 'bigint' ? value.toString() : value
            )
          );
        } catch (error) {
          // Jika gagal parsing, kembalikan data asli
          return data;
        }
      }),
    );
  }
}