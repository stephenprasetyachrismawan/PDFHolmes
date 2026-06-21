import { Controller, MessageEvent, Param, Sse, UseGuards } from "@nestjs/common";
import { Observable } from "rxjs";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { EventsService } from "./events.service";

// SSE status pipeline (§6): browser subscribe per-dokumen; worker publish via Redis.
@UseGuards(JwtAuthGuard)
@Controller("events")
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Sse("documents/:id")
  stream(@Param("id") documentId: string): Observable<MessageEvent> {
    return this.events.streamFor(documentId);
  }
}
