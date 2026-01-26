import { createApp } from './bootstrap';

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await createApp();
  const port = process.env.PORT || 3000;

  await app.listen(port);
  console.log(`🚀 Running locally on http://localhost:${port}/api`);
}

bootstrap();
