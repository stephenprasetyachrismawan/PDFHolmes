import { Inject, Injectable, MessageEvent, OnModuleInit } from "@nestjs/common";
import { Observable, Subject, filter, map } from "rxjs";
import Redis from "ioredis";
import { CHANNEL_STATUS, type StatusEvent } from "@pdfholmes/shared-types";
import { REDIS_SUB } from "../redis/redis.module";

// Satu koneksi sub Redis -> fan-out ke banyak stream SSE via Subject.
@Injectable()
export class EventsService implements OnModuleInit {
  private readonly subject = new Subject<StatusEvent>();

  constructor(@Inject(REDIS_SUB) private readonly sub: Redis) {}

  onModuleInit() {
    this.sub.subscribe(CHANNEL_STATUS);
    this.sub.on("message", (_channel, payload) => {
      try {
        this.subject.next(JSON.parse(payload) as StatusEvent);
      } catch {
        /* abaikan payload rusak */
      }
    });
  }

  streamFor(documentId: string): Observable<MessageEvent> {
    return this.subject.asObservable().pipe(
      filter((e) => e.documentId === documentId),
      map((e) => ({ data: e }) as MessageEvent),
    );
  }
}
