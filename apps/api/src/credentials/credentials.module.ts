import { Module } from "@nestjs/common";
import { CredentialsController } from "./credentials.controller";
import { CodexController } from "./codex.controller";
import { CredentialsService } from "./credentials.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [CredentialsController, CodexController],
  providers: [CredentialsService],
})
export class CredentialsModule {}
