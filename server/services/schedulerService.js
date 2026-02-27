const Quiz = require('../models/Quiz');
const Response = require('../models/Response');

/**
 * Checks for quizzes that are scheduled to start but haven't yet.
 * Starts them automatically "at any cost".
 */
const checkScheduledQuizzes = async (io) => {
    try {
        const now = new Date();
        // Find quizzes that should have started (ignore autoStart setting to ensure it starts "at any cost")
        const quizzesToStart = await Quiz.find({
            status: { $in: ['scheduled', 'draft'] },
            scheduledAt: { $ne: null, $lte: now }
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
                const room = String(quiz._id);
                io.to(room).emit('quiz:started', {
                    quizId: quiz._id,
                    startedAt: quiz.startedAt,
                    expiresAt: quiz.expiresAt,
                    currentQuestionIndex: 0,
                    totalQuestions: quiz.questions.length,
                    questions: quiz.questions.map(q => {
                        const obj = q.toObject();
                        delete obj.correctAnswer;
                        delete obj.explanation;
                        return obj;
                    }),
                    settings: {
                        questionTimer: quiz.settings.questionTimer,
                        showInstantFeedback: quiz.settings.showInstantFeedback,
                        allowTabSwitch: quiz.settings.allowTabSwitch
                    }
                });

                // Also emit status update for faculty/others
                io.to(room).emit('quizStatusUpdate', 'active');
            }
        }
    } catch (error) {
        console.error('[SCHEDULER] Error checking scheduled quizzes:', error);
    }
};

/**
 * Checks for active quizzes that have exceeded their expiresAt time.
 * Ends them automatically and emits the quiz:ended event.
 */
const checkExpiredQuizzes = async (io) => {
    try {
        const now = new Date();
        // Find active quizzes that have expired
        const expiredQuizzes = await Quiz.find({
            status: { $in: ['active', 'live', 'question_active', 'leaderboard', 'started'] },
            expiresAt: { $ne: null, $lte: now }
        });

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
                return response.save();
            });

            await Promise.all(completionPromises);

            // Update ranks & static metrics
            await Response.updateRanks(quiz._id);

            // Get final leaderboard
            const leaderboard = await Response.getLeaderboard(quiz._id);

            // Emit socket event to ensure everyone knows it ended
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

/**
 * Main entry point for the scheduler service.
 */
const initScheduler = (io) => {
    console.log('⏰ Quiz Scheduler Service Initialized (Precision: 10s)');

    // Check every 10 seconds for higher precision (at any cost)
    setInterval(() => {
        checkScheduledQuizzes(io);
        checkExpiredQuizzes(io);
    }, 10000);

    // Initial run
    checkScheduledQuizzes(io);
    checkExpiredQuizzes(io);
};

module.exports = { initScheduler };
