import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { AuthModule } from "../auth/auth.module";

// Modul AI (NON-BYOK). DB & Redis disediakan global (DbModule/RedisModule).
// AuthModule diimpor agar JwtAuthGuard bisa resolve UsersService (kalau tidak,
// this.users undefined -> 500 "Cannot read properties of undefined").
@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
