import { Controller, MessageEvent, Param, Sse, UseGuards } from "@nestjs/common";
import { Observable, defer, from, switchMap } from "rxjs";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { DbUser } from "../db/schema";
import { DocumentsService } from "../documents/documents.service";
import { EventsService } from "./events.service";

// SSE status pipeline (§6): browser subscribe per-dokumen; worker publish via Redis.
@UseGuards(JwtAuthGuard)
@Controller("events")
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly docs: DocumentsService,
  ) {}

  @Sse("documents/:id")
  stream(
    @CurrentUser() user: DbUser,
    @Param("id") documentId: string,
  ): Observable<MessageEvent> {
    // KEAMANAN (cegah IDOR): verifikasi dokumen milik user SEBELUM stream.
    // docs.get() melempar NotFound bila bukan milik user -> stream gagal,
    // tanpa ini siapa pun yg terautentikasi bisa menguping status dokumen lain.
    return defer(() => from(this.docs.get(user, documentId))).pipe(
      switchMap(() => this.events.streamFor(documentId)),
    );
  }
}
