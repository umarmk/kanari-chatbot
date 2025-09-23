import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  const origins = (process.env.WEB_URL ?? '').split(',').map(s => s.trim()).filter(Boolean);
  app.enableCors({ origin: origins.length ? origins : [/^http:\/\/localhost:(\d+)$/], credentials: true });
  app.use(cookieParser(process.env.SESSION_SIGNING_KEY || 'dev-only-secret'));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
