const cron = require('node-cron'); // I'll use setInterval instead if I don't want to install, but I can install it
const Quiz = require('../models/Quiz');
const Response = require('../models/Response');

const checkScheduledQuizzes = async (io) => {
    try {
        const now = new Date();
        // Find scheduled quizzes that should have started
        const quizzesToStart = await Quiz.find({
            status: 'scheduled',
            scheduledAt: { $lte: now },
            'settings.autoStart': true
        });

        for (const quiz of quizzesToStart) {
            console.log(`[SCHEDULER] Auto-starting quiz: ${quiz.title} (${quiz._id})`);

            quiz.status = 'active';
            quiz.startedAt = now;
            quiz.currentQuestionIndex = 0;

            // Set expiration time if quiz timer is set
            if (quiz.settings?.quizTimer > 0) {
                quiz.expiresAt = new Date(quiz.startedAt.getTime() + (quiz.settings.quizTimer * 1000) + 5000);
            } else {
                quiz.expiresAt = null;
            }

            await quiz.save();

            // Update all waiting responses to in-progress
            await Response.updateMany(
                { quizId: quiz._id, status: 'waiting' },
                { $set: { status: 'in-progress', startedAt: now } }
            );

            // Emit socket event if io is provided
            if (io) {
                io.to(String(quiz._id)).emit('quiz:started', {
                    quizId: quiz._id,
                    startedAt: quiz.startedAt,
                    expiresAt: quiz.expiresAt,
                    currentQuestionIndex: 0,
                    totalQuestions: quiz.questions.length,
                    questions: quiz.questions.map(q => ({
                        ...q.toObject(),
                        correctAnswer: undefined,
                        explanation: undefined
                    })),
                    settings: {
                        questionTimer: quiz.settings.questionTimer,
                        showInstantFeedback: quiz.settings.showInstantFeedback,
                        allowTabSwitch: quiz.settings.allowTabSwitch
                    }
                });
            }
        }
    } catch (error) {
        console.error('[SCHEDULER] Error checking scheduled quizzes:', error);
    }
};

const checkExpiredQuizzes = async (io) => {
    try {
        const now = new Date();
        // Find active quizzes that have expired (check all active-like statuses)
        const expiredQuizzes = await Quiz.find({
            status: { $in: ['active', 'live', 'question_active', 'leaderboard', 'started'] },
            expiresAt: { $ne: null, $lte: now }
        });

        if (expiredQuizzes.length > 0) {
            console.log(`[SCHEDULER] Found ${expiredQuizzes.length} expired quizzes.`);
        }

        for (const quiz of expiredQuizzes) {
            console.log(`[SCHEDULER] Auto-ending expired quiz: ${quiz.title} (${quiz._id})`);

            quiz.status = 'completed';
            quiz.endedAt = now;
            await quiz.save();

            // Find all in-progress responses and force complete them
            const activeResponses = await Response.find({
                quizId: quiz._id,
                status: { $in: ['in-progress', 'waiting'] }
            });

            const completionPromises = activeResponses.map(async (response) => {
                response.status = 'completed';
                response.completedAt = now;
                response.terminationReason = 'timeout';
                // Hook will calculate final scores
                return response.save();
            });

            await Promise.all(completionPromises);

            // Update ranks
            await Response.updateRanks(quiz._id);

            // Get final leaderboard
            const leaderboard = await Response.getLeaderboard(quiz._id);

            // Emit socket event
            if (io) {
                io.to(String(quiz._id)).emit('quiz:ended', {
                    quizId: quiz._id,
                    endedAt: quiz.endedAt,
                    leaderboard,
                    autoEnded: true
                });
            }
        }
    } catch (error) {
        console.error('[SCHEDULER] Error checking expired quizzes:', error);
    }
};

const initScheduler = (io) => {
    console.log('⏰ Quiz Scheduler Service Initialized (node-cron)');

    // Check every minute
    cron.schedule('* * * * *', () => {
        // console.log('[SCHEDULER] Running periodic checks...');
        checkScheduledQuizzes(io);
        checkExpiredQuizzes(io);
    });

    // Also run immediately on start
    checkScheduledQuizzes(io);
    checkExpiredQuizzes(io);
};

module.exports = { initScheduler };
