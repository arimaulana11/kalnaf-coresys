import { createApp } from './bootstrap';

// Polyfill BigInt
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

let cachedApp: any;

// Handler untuk Vercel (Serverless)
export default async function handler(req: any, res: any) {
  if (!cachedApp) {
    const app = await createApp();
    await app.init(); // Inisialisasi NestJS tanpa listen
    cachedApp = app.getHttpAdapter().getInstance();
  }
  return cachedApp(req, res);
}

// Logika untuk Local (Hanya jalan jika dipanggil langsung, bukan oleh Vercel)
if (process.env.NODE_ENV !== 'production') {
  async function bootstrap() {
    const app = await createApp();
    const port = process.env.PORT || 3000;
    await app.listen(port);
    console.log(`🚀 Running locally on http://localhost:${port}/api`);
  }
  bootstrap();
}