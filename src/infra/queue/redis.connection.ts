import { Redis, RedisOptions } from "ioredis";

export function createRedisConnection(customOptions?: Partial<RedisOptions>): Redis {
  const host = process.env["REDIS_HOST"] ?? "localhost";
  const port = Number(process.env["REDIS_PORT"] ?? 6379);
  const password = process.env["REDIS_PASSWORD"] || undefined;

  const options: RedisOptions = {
    host,
    port,
    password,
    maxRetriesPerRequest: null, // Mandatory for BullMQ
    connectTimeout: 10000,      // 10s timeout
    commandTimeout: 5000,       // 5s command timeout
    retryStrategy(times: number) {
      if (times > 10) {
        console.error(
          JSON.stringify({
            level: "ERROR",
            component: "RedisConnection",
            message: `Redis connection aborted after ${times} failed attempts`,
            timestamp: new Date().toISOString(),
          })
        );
        return null;
      }
      const delay = Math.min(times * 500, 3000);
      return delay;
    },
    ...customOptions,
  };

  const redis = new Redis(options);

  redis.on("connect", () => {
    console.info(
      JSON.stringify({
        level: "INFO",
        component: "RedisConnection",
        message: `Connected to Redis at ${host}:${port}`,
        timestamp: new Date().toISOString(),
      })
    );
  });

  redis.on("error", (error) => {
    console.error(
      JSON.stringify({
        level: "ERROR",
        component: "RedisConnection",
        message: "Redis connection error",
        error: error.message,
        timestamp: new Date().toISOString(),
      })
    );
  });

  redis.on("close", () => {
    console.warn(
      JSON.stringify({
        level: "WARN",
        component: "RedisConnection",
        message: "Redis connection closed",
        timestamp: new Date().toISOString(),
      })
    );
  });

  return redis;
}
