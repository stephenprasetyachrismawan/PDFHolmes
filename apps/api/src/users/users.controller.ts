import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { DbUser } from "../db/schema";
import { UsersService } from "./users.service";

class UpdateMeDto {
  @IsOptional() @IsString() @MaxLength(16) preferredLanguage?: string;
  @IsOptional() @IsString() @MaxLength(2000) researchInterest?: string;
}

@UseGuards(JwtAuthGuard)
@Controller("me")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: DbUser) {
    return this.toDto(user);
  }

  @Patch()
  async update(@CurrentUser() user: DbUser, @Body() dto: UpdateMeDto) {
    const updated = await this.users.updatePreferences(user.id, {
      preferredLanguage: dto.preferredLanguage,
      researchInterest: dto.researchInterest,
    });
    return this.toDto(updated);
  }

  private toDto(u: DbUser) {
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      preferredLanguage: u.preferredLanguage,
      minioBucket: u.minioBucket,
      researchInterest: u.researchInterest,
    };
  }
}
