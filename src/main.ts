// MUST be the first import: any module transitively imported below (e.g.
// AppModule -> AuthModule -> jwt.constants.ts) reads process.env at module
// evaluation time. If dotenv/config runs after those imports resolve, the
// values it loads are computed too late to reach code that already read
// `undefined` and baked it into an exported constant (see jwt.constants.ts).
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const cors = {
    origin: process.env.CORS_ORIGIN.trim(),
    methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    allowedHeaders: 'Content-Type, Authorization',
  }
  app.enableCors(cors); 
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
