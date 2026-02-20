const Redis = require('ioredis');
require('dotenv').config();

const testRedis = async () => {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        console.error('REDIS_URL is missing in .env');
        return;
    }

    console.log('Attempting to connect to Redis...');
    const redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 1
    });

    redis.on('connect', () => console.log('✅ Redis Connected!'));
    redis.on('error', (err) => console.error('❌ Redis Connection Error:', err.message));

    try {
        await redis.set('test_key', 'it_works');
        const val = await redis.get('test_key');
        console.log(`Test value retrieved: ${val}`);
        await redis.quit();
    } catch (e) {
        console.error('Failed to operate on Redis:', e.message);
    }
};

testRedis();
