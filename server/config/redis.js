const Redis = require('ioredis');

let client = null;
let subscriber = null; // Separate subscriber client for Pub/Sub

const getRedisConfig = () => {
    // Check for Sentinel Configuration
    if (process.env.REDIS_SENTINELS) {
        const sentinels = process.env.REDIS_SENTINELS.split(',').map(s => {
            const [host, port] = s.split(':');
            return { host, port: parseInt(port) || 26379 };
        });

        console.log(`⚙️ Configuring Redis with Sentinels: ${JSON.stringify(sentinels)}`);

        return {
            sentinels,
            name: process.env.REDIS_MASTER_NAME || 'mymaster',
            password: process.env.REDIS_PASSWORD,
            retryStrategy: (times) => Math.min(times * 50, 2000), // Retry delay
        };
    }

    // Fallback to Standard/Single URL
    const redisUrl = process.env.REDIS_URL || (process.env.REDIS_HOST ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}` : null);

    if (redisUrl) {
        return redisUrl;
    }

    return null;
};

const initRedis = () => {
    if (client) return client;

    const config = getRedisConfig();

    if (!config) {
        console.warn('⚠️ Redis not configured. Caching and Scaling features will be disabled.');
        return null;
    }

    try {
        console.log('🔄 Initializing Redis Client...');
        client = new Redis(config);

        client.on('error', (err) => console.error('❌ Redis Client Error:', err));
        client.on('connect', () => console.log('✅ Redis Client Connected'));
        client.on('ready', () => console.log('✅ Redis Client Ready'));

        return client;
    } catch (error) {
        console.error('❌ Failed to initialize Redis:', error);
        return null;
    }
};

const getClient = () => {
    if (!client) {
        return initRedis();
    }
    return client;
};

// Create a duplicate client (essential for Socket.io adapter which needs separate Pub and Sub connections)
const createRedisClient = () => {
    const config = getRedisConfig();
    if (!config) return null;
    return new Redis(config);
};

module.exports = { initRedis, getClient, createRedisClient };
