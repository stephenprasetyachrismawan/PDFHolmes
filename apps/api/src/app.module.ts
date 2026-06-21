import { Module } from "@nestjs/common";
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
})
export class AppModule {}
