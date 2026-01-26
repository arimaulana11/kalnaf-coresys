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
    console.log("--- REQUEST RECEIVED ---"); // Log untuk memastikan fungsi terpanggil
    if (!cachedApp) {
      console.log("Bootstrapping NestJS...");
      const app = await createApp();
      await app.init();
      cachedApp = app.getHttpAdapter().getInstance();
      console.log("NestJS Initialized!");
    }
    return cachedApp(req, res);
  } catch (err: any) {
    // TAMPILKAN ERROR KE LOG VERCEL
    console.error("FATAL_BOOTSTRAP_ERROR:", err.stack || err);
    
    res.status(500).json({
      error: "FUNCTION_INVOCATION_FAILED_DETAIL",
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
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