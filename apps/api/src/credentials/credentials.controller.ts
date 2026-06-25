import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { DbUser } from "../db/schema";
import { CredentialsService } from "./credentials.service";

class CreateCredDto {
  @IsIn(["openai", "anthropic", "google", "openai_compatible", "codex"])
  provider!: "openai" | "anthropic" | "google" | "openai_compatible" | "codex";
  @IsIn(["api_key", "oauth_codex"]) authType!: "api_key" | "oauth_codex";
  @IsOptional() @IsString() @MaxLength(120) label?: string;
  @IsString() secret!: string;
  @IsOptional() @IsString() @MaxLength(120) model?: string;
  @IsOptional() @IsString() @MaxLength(300) baseUrl?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller("credentials")
export class CredentialsController {
  constructor(private readonly creds: CredentialsService) {}

  @Get()
  list(@CurrentUser() user: DbUser) {
    return this.creds.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: DbUser, @Body() dto: CreateCredDto) {
    return this.creds.create(user.id, dto);
  }

  @Put(":id/default")
  setDefault(@CurrentUser() user: DbUser, @Param("id") id: string) {
    return this.creds.setDefault(user.id, id);
  }

  @Delete(":id")
  remove(@CurrentUser() user: DbUser, @Param("id") id: string) {
    return this.creds.remove(user.id, id);
  }
}
