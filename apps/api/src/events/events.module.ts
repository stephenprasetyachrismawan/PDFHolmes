import { Module } from "@nestjs/common";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";
import { AuthModule } from "../auth/auth.module";
import { DocumentsModule } from "../documents/documents.module";

@Module({
  imports: [AuthModule, DocumentsModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
