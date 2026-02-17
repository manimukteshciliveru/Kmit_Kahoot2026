const Redis = require("ioredis");

let redis = null;

if (process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        reconnectOnError: () => false,
    });

    redis.on("connect", () => {
        console.log("✅ Connected to Upstash Redis");
    });

    redis.on("error", (err) => {
        console.error("❌ Redis Error:", err.message);
    });
} else {
    console.log("⚠️ REDIS_URL not found. Redis disabled.");
}

module.exports = redis;
