import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { DbUser } from "../db/schema";
import { DocumentsService } from "./documents.service";

class CreateUploadDto {
  @IsString() @MaxLength(300) filename!: string;
  @IsOptional() @IsUUID() folderId?: string;
  @IsOptional() @IsInt() @Min(0) sizeBytes?: number;
}

@UseGuards(JwtAuthGuard)
@Controller("documents")
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  // POST /api/documents/upload -> { document, uploadUrl }
  @Post("upload")
  createUpload(@CurrentUser() user: DbUser, @Body() dto: CreateUploadDto) {
    return this.docs.createUpload(user, {
      filename: dto.filename,
      folderId: dto.folderId ?? null,
      sizeBytes: dto.sizeBytes,
    });
  }

  @Post(":id/confirm")
  confirm(@CurrentUser() user: DbUser, @Param("id") id: string) {
    return this.docs.confirmUpload(user, id);
  }

  @Get()
  list(@CurrentUser() user: DbUser, @Query("folderId") folderId?: string) {
    return this.docs.list(user, folderId ?? null);
  }

  @Get(":id")
  get(@CurrentUser() user: DbUser, @Param("id") id: string) {
    return this.docs.get(user, id);
  }

  @Get(":id/view-url")
  viewUrl(@CurrentUser() user: DbUser, @Param("id") id: string) {
    return this.docs.viewUrl(user, id);
  }

  @Delete(":id")
  remove(@CurrentUser() user: DbUser, @Param("id") id: string) {
    return this.docs.remove(user, id);
  }
}
