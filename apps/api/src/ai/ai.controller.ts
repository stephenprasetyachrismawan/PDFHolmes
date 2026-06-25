import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsString, MaxLength, MinLength } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { DbUser } from "../db/schema";
import { config } from "../config";
import { AiService } from "./ai.service";

class ChatDto {
  // Klien HANYA mengirim prompt. API key tak pernah dari klien (NON-BYOK).
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  prompt!: string;
}

@UseGuards(JwtAuthGuard)
@Controller("ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  // POST /api/ai/chat — auth wajib + rate limit (IP-level di throttler, plus
  // per-user & global di AiService via Redis).
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post("chat")
  chat(@CurrentUser() user: DbUser, @Body() dto: ChatDto) {
    return this.ai.chat(user, dto.prompt);
  }

  // Metadata NON-rahasia utk UI (model/provider). API key TIDAK disertakan.
  @Get("config")
  publicConfig() {
    return {
      model: config.opencode.model,
      providerType: config.opencode.providerType,
      maxInputChars: config.opencode.maxInputChars,
      byok: false,
    };
  }
}
