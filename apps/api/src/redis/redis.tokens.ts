// Token DI terpisah utk hindari circular import antara redis.module <-> queue.service.
export const REDIS = Symbol("REDIS");
export const REDIS_SUB = Symbol("REDIS_SUB");
