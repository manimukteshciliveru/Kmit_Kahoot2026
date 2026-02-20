const { Queue, Worker, QueueEvents } = require('bullmq');
const { redisConfig, redisOptions } = require('../config/redis');
const logger = require('../utils/logger');

// Queues
let aiQuizQueue = null;

const initQueues = () => {
    if (!redisConfig) {
        logger.warn('AI Queue NOT initialized: Redis not configured');
        return;
    }

    const connection = {
        url: redisConfig,
        ...redisOptions
    };

    // 1. Create the AI Generation Queue
    aiQuizQueue = new Queue('aiQuizGeneration', { connection });

    logger.info('🚀 Background Queues Initialized (BullMQ)');

    // 2. Initialize Worker
    const worker = new Worker('aiQuizGeneration', async (job) => {
        const { type, data, options, userId } = job.data;
        logger.info(`Processing job ${job.id} for userId: ${userId}`);

        // Import the generator inside the worker to avoid circular deps
        const aiGenerator = require('./aiGenerator');

        try {
            let questions;
            if (type === 'text') {
                questions = await aiGenerator.generateFromText(data, options, userId);
            } else if (type === 'file') {
                // For files, we usually have a path or content
                questions = await aiGenerator.generateFromMultimodal(data, options, userId);
            }

            // In a real app, you might want to save to DB here or emit a socket event
            return { questions, count: questions.length };
        } catch (error) {
            logger.error(`Error in Worker for job ${job.id}:`, error);
            throw error;
        }
    }, { connection });

    worker.on('completed', (job) => {
        logger.info(`Job ${job.id} has completed!`);
    });

    worker.on('failed', (job, err) => {
        logger.error(`Job ${job.id} has failed with ${err.message}`);
    });
};

const addJobToAIQueue = async (data) => {
    if (!aiQuizQueue) {
        throw new Error('Queue not initialized');
    }
    return await aiQuizQueue.add('generateQuiz', data, {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: true
    });
};

module.exports = {
    initQueues,
    addJobToAIQueue
};
