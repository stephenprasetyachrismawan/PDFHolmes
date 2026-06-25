import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { assertProdConfig, config } from "./config";

async function bootstrap() {
  assertProdConfig(); // gagal cepat bila config wajib hilang / dev-bypass di prod
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // Header keamanan (§16). API JSON saja → CSP bawaan dimatikan agar tak ganggu.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

  // Di belakang reverse proxy (Caddy) → percayai header X-Forwarded-*.
  app.getHttpAdapter().getInstance().set("trust proxy", 1);

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );

  app.enableCors({
    origin: config.webOrigin.split(","),
    credentials: true,
  });

  app.enableShutdownHooks(); // tutup koneksi DB/Redis rapi saat SIGTERM

  await app.listen(config.port, "0.0.0.0");
  Logger.log(`api listening on :${config.port} (prefix /api, env=${config.nodeEnv})`, "Bootstrap");
}

bootstrap();
