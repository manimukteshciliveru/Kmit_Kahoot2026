const Redis = require('ioredis');

let client = null;

const getRedisConfig = () => {
    // Check for Sentinel Configuration
    if (process.env.REDIS_SENTINELS) {
        const sentinels = process.env.REDIS_SENTINELS.split(',').map(s => {
            const [host, port] = s.split(':');
            return { host, port: parseInt(port) || 26379 };
        });

        return {
            sentinels,
            name: process.env.REDIS_MASTER_NAME || 'mymaster',
            password: process.env.REDIS_PASSWORD,
            retryStrategy: (times) => Math.min(times * 100, 3000), // Slower retry strategy
            maxRetriesPerRequest: null, // Allow unlimited retries to prevent crash
            enableReadyCheck: false // Don't crash if not ready immediately
        };
    }

    // Explicit check for REDIS_URL
    if (process.env.REDIS_URL) {
        return {
            path: process.env.REDIS_URL,
            retryStrategy: (times) => Math.min(times * 100, 3000),
            maxRetriesPerRequest: null,
            enableReadyCheck: false
        }
    }

    // Safety Check: Avoid connecting to generic hostnames like 'redis-master' in Cloud environments
    if (process.env.REDIS_HOST && process.env.REDIS_HOST !== 'redis-master') {
        return {
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD,
            retryStrategy: (times) => Math.min(times * 100, 3000),
            maxRetriesPerRequest: null
        };
    }

    return null;
};

const initRedis = () => {
    if (client) return client;

    const config = getRedisConfig();

    if (!config) {
        console.warn('⚠️ Redis not configured. App will run in Single-Node mode (No Scaling).');
        return null;
    }

    try {
        console.log('🔄 Initializing Redis Client...');

        // Handle URL string vs Object config
        if (config.path) {
            client = new Redis(config.path, {
                retryStrategy: config.retryStrategy,
                maxRetriesPerRequest: config.maxRetriesPerRequest
            });
        } else {
            client = new Redis(config);
        }

        client.on('error', (err) => {
            console.error('❌ Redis Client Error:', err.message);
            // Prevent app crash by handling error here
        });

        client.on('connect', () => console.log('✅ Redis Client Connected'));

        return client;
    } catch (error) {
        console.error('❌ Failed to initialize Redis:', error.message);
        return null;
    }
};

const getClient = () => {
    if (!client) return initRedis();
    return client;
};

const createRedisClient = () => {
    const config = getRedisConfig();
    if (!config) return null;

    let newClient;
    try {
        if (config.path) {
            newClient = new Redis(config.path, {
                retryStrategy: config.retryStrategy,
                maxRetriesPerRequest: config.maxRetriesPerRequest
            });
        } else {
            newClient = new Redis(config);
        }

        newClient.on('error', (err) => {
            console.error('❌ Redis Pub/Sub Client Error:', err.message);
        });

        return newClient;
    } catch (err) {
        return null;
    }
};

module.exports = { initRedis, getClient, createRedisClient };
