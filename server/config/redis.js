const Redis = require("ioredis");
const logger = require("../utils/logger");

const redisOptions = {
    maxRetriesPerRequest: null, // Critical for BullMQ
    enableReadyCheck: false,
    reconnectOnError: (err) => {
        const targetError = "READONLY";
        if (err.message.includes(targetError)) {
            return true;
        }
        return false;
    },
};

let redisConfig = null;

if (process.env.REDIS_URL) {
    redisConfig = process.env.REDIS_URL;
    logger.info("ℹ️ Redis config detected from REDIS_URL");
} else {
    logger.warn("⚠️ REDIS_URL not found. Redis-based features will be disabled.");
}

module.exports = {
    redisConfig,
    redisOptions
};
