import { Tenant } from '@prisma/client';
import 'express';

declare module 'express' {
  interface Request {
    user?: {
      sub: string;
      email: string;
      tenantId: string;
      role: string;
    };
    tenant?: Tenant;
  }
}
