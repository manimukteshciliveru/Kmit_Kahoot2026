const rateLimit = require('express-rate-limit');
const RateLimitRedis = require('rate-limit-redis');
// Robustly handle different export formats (CJS/ESM/Default)
const RedisStore = RateLimitRedis.RedisStore || RateLimitRedis.default || RateLimitRedis;
const Redis = require('ioredis');

// Initialize Redis client only if configured
const useRedis = !!process.env.REDIS_HOST;
let redisClient;

if (useRedis) {
    redisClient = new Redis({
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT || 6379,
        enableOfflineQueue: false,
    });

    redisClient.on('error', (err) => {
        console.warn('⚠️ Redis connection error. Rate limiting will rely on fallback handling:', err.message);
    });
} else {
    console.log('ℹ️ No REDIS_HOST found. Using MemoryStore for rate limiting.');
}

// Function to create store based on availability
const createStore = () => {
    if (!useRedis || !redisClient) return undefined; // undefined = MemoryStore

    // Wrap RedisStore to fail open if Redis is down
    try {
        return new RedisStore({
            sendCommand: async (...args) => {
                if (redisClient.status !== 'ready') {
                    // console.warn('Redis not ready, bypassing rate limit check (failing open)');
                    throw new Error('Redis not ready');
                }
                return redisClient.call(...args);
            },
        });
    } catch (e) {
        console.error('Failed to initialize RedisStore, falling back to MemoryStore');
        return undefined;
    }
};

// Common Limiter Options
const commonOptions = {
    standardHeaders: true,
    legacyHeaders: false,
    // Safely handle store errors (fail open) rather than crashing with 500
    skipFailedRequests: true,
    requestWasSuccessful: (req, res) => res.statusCode < 400,
    handler: (req, res, next, options) => {
        res.status(options.statusCode).json(options.message);
    }
};

const limiter = rateLimit({
    ...commonOptions,
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 2000,
    message: { success: false, message: 'Too many requests, please try again later.' },
    store: createStore(), // Will be MemoryStore if Redis is unreachable/unconfigured
});

const authLimiter = rateLimit({
    ...commonOptions,
    windowMs: 60 * 1000, // 1 minute
    max: 20,
    message: { success: false, message: 'Too many login attempts, please try again after a minute.' },
    store: createStore(),
});

module.exports = { limiter, authLimiter, redisClient };
