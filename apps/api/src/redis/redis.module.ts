import { Global, Module } from "@nestjs/common";
import Redis from "ioredis";
import { config } from "../config";
import { QueueService } from "./queue.service";
import { REDIS, REDIS_SUB } from "./redis.tokens";

export { REDIS, REDIS_SUB } from "./redis.tokens";

@Global()
@Module({
  providers: [
    { provide: REDIS, useFactory: () => new Redis(config.redisUrl) },
    // Koneksi terpisah utk subscribe (ioredis: koneksi sub tak bisa publish).
    { provide: REDIS_SUB, useFactory: () => new Redis(config.redisUrl) },
    QueueService,
  ],
  exports: [REDIS, REDIS_SUB, QueueService],
})
export class RedisModule {}
