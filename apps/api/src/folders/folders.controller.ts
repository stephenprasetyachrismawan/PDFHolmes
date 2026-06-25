import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { DbUser } from "../db/schema";
import { FoldersService } from "./folders.service";

class CreateFolderDto {
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsUUID() parentId?: string;
}
class RenameFolderDto {
  @IsString() @MaxLength(200) name!: string;
}

@UseGuards(JwtAuthGuard)
@Controller("folders")
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Get()
  list(@CurrentUser() user: DbUser, @Query("parentId") parentId?: string) {
    return this.folders.list(user.id, parentId ?? null);
  }

  @Post()
  create(@CurrentUser() user: DbUser, @Body() dto: CreateFolderDto) {
    return this.folders.create(user.id, dto.name, dto.parentId ?? null);
  }

  @Patch(":id")
  rename(@CurrentUser() user: DbUser, @Param("id") id: string, @Body() dto: RenameFolderDto) {
    return this.folders.rename(user.id, id, dto.name);
  }

  @Delete(":id")
  remove(@CurrentUser() user: DbUser, @Param("id") id: string) {
    return this.folders.remove(user.id, id);
  }
}
