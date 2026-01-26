// src/main.ts
import { createApp } from './bootstrap';

// Polyfill BigInt
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

let cachedApp: any;

// Handler untuk Vercel (Serverless)
export default async function handler(req: any, res: any) {
  if (!cachedApp) {
    console.log("Inisialisasi NestJS untuk Serverless...");
    const app = await createApp();
    await app.init();
    cachedApp = app.getHttpAdapter().getInstance();
  }
  return cachedApp(req, res);
}

// Logika untuk Local (Murni Lokal, bukan saat berjalan di bawah Vercel CLI)
// Vercel CLI akan menyetel process.env.VERCEL menjadi '1'
if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
  async function bootstrap() {
    try {
      const app = await createApp();
      const port = 3001; // <--- UBAH KE 3001 UNTUK TES LOKAL AGAR TIDAK BENTROK DENGAN VERCEL (3000)
      await app.listen(port);
      console.log(`🚀 NestJS engine running locally on port ${port}`);
    } catch (err) {
      // Abaikan error EADDRINUSE jika kita tahu Vercel sedang berjalan
      if (err.code !== 'EADDRINUSE') {
        console.error("Gagal menjalankan server lokal:", err);
      }
    }
  }
  bootstrap();
}