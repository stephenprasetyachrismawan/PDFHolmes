import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import { assertProdConfig } from "./config";

async function bootstrap() {
  assertProdConfig(); // gagal cepat bila config wajib hilang (kecuali dev bypass)
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );

  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  app.enableCors({
    origin: webOrigin.split(","),
    credentials: true,
  });

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
  Logger.log(`api listening on :${port} (prefix /api)`, "Bootstrap");
}

bootstrap();
