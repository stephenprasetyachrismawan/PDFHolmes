import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { DbModule } from "./db/db.module";
import { RedisModule } from "./redis/redis.module";
import { StorageModule } from "./storage/storage.module";
import { CryptoModule } from "./crypto/crypto.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { FoldersModule } from "./folders/folders.module";
import { DocumentsModule } from "./documents/documents.module";
import { AnalysesModule } from "./analyses/analyses.module";
import { EventsModule } from "./events/events.module";
import { CredentialsModule } from "./credentials/credentials.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    // Rate limit global (§16): lindungi dari abuse & biaya AI tak terduga.
    // Default 100 req / 60 dtk per IP. Endpoint berat bisa override lebih ketat.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    // Global infra
    DbModule,
    RedisModule,
    StorageModule,
    CryptoModule,
    // Feature modules
    AuthModule,
    UsersModule,
    FoldersModule,
    DocumentsModule,
    AnalysesModule,
    EventsModule,
    CredentialsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
