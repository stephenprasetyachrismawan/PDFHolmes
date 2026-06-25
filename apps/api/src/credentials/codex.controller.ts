import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  HttpException,
} from "@nestjs/common";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { DbUser } from "../db/schema";
import { config } from "../config";

class StartDto {
  @IsOptional() @IsBoolean() makeDefault?: boolean;
  @IsOptional() @IsString() @MaxLength(120) model?: string;
}

// Proxy device-flow Codex (§8.2) ke service internal codex-auth, per-user.
// Kredensial disimpan codex-auth langsung ke ai_credentials (terenkripsi).
@UseGuards(JwtAuthGuard)
@Controller("credentials/codex/device")
export class CodexController {
  private async forward(path: string, init?: RequestInit) {
    const res = await fetch(`${config.codexAuthUrl}${path}`, init).catch((e) => {
      throw new HttpException(`codex-auth tak terjangkau: ${e.message}`, 502);
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpException(body ?? "codex-auth error", res.status);
    return body;
  }

  @Post("start")
  start(@CurrentUser() user: DbUser, @Body() dto: StartDto) {
    return this.forward("/device/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        makeDefault: dto.makeDefault ?? true,
        model: dto.model,
      }),
    });
  }

  @Get("status/:sessionId")
  status(@Param("sessionId") sessionId: string) {
    return this.forward(`/device/status/${encodeURIComponent(sessionId)}`);
  }
}
