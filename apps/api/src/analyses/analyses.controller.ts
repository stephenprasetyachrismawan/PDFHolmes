import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { DbUser } from "../db/schema";
import { AnalysesService } from "./analyses.service";

class TriggerDto {
  @IsOptional() @IsString() @MaxLength(16) language?: string;
}

@UseGuards(JwtAuthGuard)
@Controller("documents/:id/analysis")
export class AnalysesController {
  constructor(private readonly analyses: AnalysesService) {}

  // Maks 10 analisis / menit per IP — kendalikan biaya AI (§16).
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post()
  trigger(@CurrentUser() user: DbUser, @Param("id") id: string, @Body() dto: TriggerDto) {
    return this.analyses.trigger(user, id, dto.language);
  }

  @Get()
  get(@CurrentUser() user: DbUser, @Param("id") id: string) {
    return this.analyses.getLatest(user, id);
  }
}
