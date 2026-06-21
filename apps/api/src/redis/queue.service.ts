import { Inject, Injectable } from "@nestjs/common";
import Redis from "ioredis";
import {
  QUEUE_EXTRACT,
  QUEUE_ANALYZE,
  CHANNEL_STATUS,
  type Job,
  type StatusEvent,
} from "@pdfholmes/shared-types";
import { REDIS } from "./redis.module";

// Antrian via Redis list (LPUSH/BRPOP) — netral bahasa, dikonsumsi worker Python.
@Injectable()
export class QueueService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async enqueueExtract(documentId: string, userId: string): Promise<void> {
    const job: Job = { type: "EXTRACT", documentId, userId };
    await this.redis.lpush(QUEUE_EXTRACT, JSON.stringify(job));
  }

  async enqueueAnalyze(documentId: string, userId: string, language: string): Promise<void> {
    const job: Job = { type: "ANALYZE", documentId, userId, language };
    await this.redis.lpush(QUEUE_ANALYZE, JSON.stringify(job));
  }

  // Worker mempublish status; api meneruskannya ke browser via SSE.
  async publishStatus(evt: StatusEvent): Promise<void> {
    await this.redis.publish(CHANNEL_STATUS, JSON.stringify(evt));
  }
}
