import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => this.serialize(data)),
    );
  }

  private serialize(obj: any): any {
    if (obj === null || obj === undefined) return obj;

    // Jika ketemu BigInt, ubah jadi Number (atau String jika angkanya sangat besar)
    if (typeof obj === 'bigint') {
      return Number(obj); 
    }

    // Jika array, rekursif ke tiap elemen
    if (Array.isArray(obj)) {
      return obj.map((item) => this.serialize(item));
    }

    // Jika objek, rekursif ke tiap property
    if (typeof obj === 'object') {
      return Object.keys(obj).reduce((acc, key) => {
        acc[key] = this.serialize(obj[key]);
        return acc;
      }, {});
    }

    return obj;
  }
}