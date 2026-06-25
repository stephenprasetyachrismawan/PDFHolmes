import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";

// Modul AI (NON-BYOK). DB & Redis disediakan global (DbModule/RedisModule).
@Module({
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
