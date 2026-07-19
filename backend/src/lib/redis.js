import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL, {
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

redis.on("error", (err) => console.error("[Redis]", err.message));

export default redis;
