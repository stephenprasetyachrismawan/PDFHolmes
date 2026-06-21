import { Controller, Get, Inject } from "@nestjs/common";
import { sql } from "drizzle-orm";
import Redis from "ioredis";
import { DB, type Database } from "./db/db.module";
import { REDIS } from "./redis/redis.tokens";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  // Liveness ringan — tak sentuh dependency.
  @Get()
  health() {
    return { status: "ok", service: "api", ts: new Date().toISOString() };
  }

  // Readiness — cek DB + Redis benar-benar terjangkau (utk load balancer/compose).
  @Get("ready")
  async ready() {
    const checks: Record<string, string> = {};
    let ok = true;
    try {
      await this.db.execute(sql`SELECT 1`);
      checks.db = "ok";
    } catch (e) {
      checks.db = "fail";
      ok = false;
    }
    try {
      await this.redis.ping();
      checks.redis = "ok";
    } catch (e) {
      checks.redis = "fail";
      ok = false;
    }
    return { status: ok ? "ready" : "degraded", checks, ts: new Date().toISOString() };
  }
}
