const rateLimit = require('express-rate-limit');
const RateLimitRedis = require('rate-limit-redis');
// Robustly handle different export formats (CJS/ESM/Default)
const RedisStore = RateLimitRedis.RedisStore || RateLimitRedis.default || RateLimitRedis;
const redis = require('../config/redis');

// Function to create store based on availability
const createStore = () => {
    if (!redis) {
        console.log('ℹ️ Redis not available. Using MemoryStore for rate limiting.');
        return undefined; // undefined = MemoryStore
    }

    // Wrap RedisStore to fail open if Redis is down
    try {
        return new RedisStore({
            sendCommand: async (...args) => {
                if (redis.status !== 'ready' && redis.status !== 'connect') {
                    // console.warn('Redis not ready, bypassing rate limit check (failing open)');
                    throw new Error('Redis not ready');
                }
                return redis.call(...args);
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

module.exports = { limiter, authLimiter };
