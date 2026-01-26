// src/main.ts
import { createApp } from './bootstrap';

// Polyfill BigInt (Tetap di sini agar terpasang di level global)
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

let cachedApp: any;

/**
 * Handler untuk Vercel Serverless
 */
export const handler = async (req: any, res: any) => {
  try {
    if (!cachedApp) {
      console.log("Initializing NestJS for Vercel...");
      const app = await createApp();
      await app.init(); // Penting: Inisialisasi tanpa listen
      cachedApp = app.getHttpAdapter().getInstance();
    }
    return cachedApp(req, res);
  } catch (err: any) {
    console.error("Vercel Execution Error:", err);
    // Memberikan respon JSON agar lebih mudah di-debug di browser
    res.status(500).json({
      statusCode: 500,
      message: "Initialisation Error",
      error: err.message,
    });
  }
};

// Default export untuk Vercel
export default handler;

/**
 * Logika Running Lokal (npm run start:dev)
 */
if (!process.env.VERCEL) {
  async function bootstrap() {
    try {
      const app = await createApp();
      const port = process.env.PORT || 3001;
      await app.listen(port);
      console.log(`🚀 NestJS engine running locally on port ${port}`);
    } catch (err) {
      console.error("Failed to run local server:", err);
    }
  }
  bootstrap();
}