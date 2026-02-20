const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Quiz = require('../models/Quiz');
const Response = require('../models/Response');
const LeaderboardService = require('../services/leaderboardService');
const logger = require('../utils/logger');

// Simple In-Memory Rate Limiting for Socket Events
const socketRateLimit = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_JOINS_PER_MIN = 100; // Increased for classroom sessions

// Debouncing rank updates to avoid O(N^2) DB pressure
const rankUpdateDebounces = new Map(); // quizId -> timeout

module.exports = (io) => {

    // --- Helper Functions (Stateless) ---

    const getRemainingTime = (quiz) => {
        if (!quiz.startedAt || (!quiz.settings?.quizTimer && !quiz.expiresAt)) return null;

        const now = new Date();
        const expiresAt = quiz.expiresAt ? new Date(quiz.expiresAt) : new Date(new Date(quiz.startedAt).getTime() + (quiz.settings.quizTimer * 1000));

        const remainingMs = expiresAt.getTime() - now.getTime();
        return remainingMs > 0 ? remainingMs : 0;
    };

    const checkAnswer = (question, answer) => {
        if (!answer) return false;
        const normalize = (str) => str.toString().toLowerCase().trim();

        if (question.type === 'mcq') {
            return normalize(answer) === normalize(question.correctAnswer);
        } else if (question.type === 'msq') {
            const userAnswers = String(answer).split(',').map(a => normalize(a)).sort();
            const correctAnswers = String(question.correctAnswer).split(',').map(a => normalize(a)).sort();
            if (userAnswers.length !== correctAnswers.length) return false;
            return userAnswers.every((val, index) => val === correctAnswers[index]);
        } else if (question.type === 'fill-blank') {
            const correctAnswers = String(question.correctAnswer).split('|').map(a => normalize(a));
            return correctAnswers.includes(normalize(answer));
        } else if (question.type === 'qa') {
            const userAns = normalize(answer);
            const correct = normalize(question.correctAnswer);
            return userAns.includes(correct) || correct.includes(userAns);
        }
        return false;
    };

    const forceEndQuiz = async (quizId) => {
        try {
            const quiz = await Quiz.findById(quizId);
            if (!quiz || quiz.status === 'finished') return;

            logger.info(`⏰ [AUTO-END] Force ending quiz: ${quiz.title}`);

            quiz.status = 'finished';
            quiz.endedAt = new Date();
            await quiz.save();

            await Response.updateMany(
                { quizId, status: { $in: ['waiting', 'in-progress'] } },
                { $set: { status: 'completed', completedAt: new Date() } }
            );

            await Response.updateRanks(quizId);
            const leaderboard = await Response.getLeaderboard(quizId, 10);

            io.to(`quiz:${quizId}`).emit('quiz:ended', {
                quizId,
                endedAt: quiz.endedAt,
                leaderboard,
                autoEnded: true
            });

            // Disconnect students from the room
            const sockets = await io.in(`quiz:${quizId}`).fetchSockets();
            sockets.forEach(s => {
                if (s.user?.role === 'student') s.leave(`quiz:${quizId}`);
            });

            io.emit('quiz:status_update', { quizId, status: 'finished' });

        } catch (error) {
            logger.error('❌ [AUTO-END] Error:', error);
        }
    };

    const debounceRankUpdate = (quizId) => {
        if (rankUpdateDebounces.has(quizId)) return;

        const timeout = setTimeout(async () => {
            try {
                await Response.updateRanks(quizId);
                const leaderboard = await Response.getLeaderboard(quizId, 10);
                io.to(`quiz:${quizId}`).emit('leaderboard:update', { leaderboard });
                rankUpdateDebounces.delete(quizId);
            } catch (err) {
                logger.error('Rank Update Error:', err);
                rankUpdateDebounces.delete(quizId);
            }
        }, 5000); // Only update ranks every 5 seconds per quiz

        rankUpdateDebounces.set(quizId, timeout);
    };

    // --- Middleware ---

    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) return next(new Error('Authentication required'));

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('name role avatar isActive department section rollNumber');

            if (!user || !user.isActive) return next(new Error('User not found or inactive'));

            socket.user = user;
            next();
        } catch (error) {
            next(new Error('Invalid token'));
        }
    });

    // --- Connection Handler ---

    io.on('connection', (socket) => {
        const userIdStr = socket.user._id.toString();
        logger.info(`🔌 Socket connected: ${socket.user.name} (${socket.user.role}) - ${userIdStr}`);
        socket.join(`user:${userIdStr}`);

        // 1. Sync State
        socket.on('quiz:sync', async (data) => {
            const { quizId } = data;
            try {
                const quiz = await Quiz.findById(quizId);
                if (!quiz) return socket.emit('error', { message: 'Quiz not found' });

                if (quiz.status === 'finished' || quiz.status === 'completed') {
                    socket.emit('quiz:ended', { quizId, endedAt: quiz.endedAt || new Date() });
                    return;
                }

                const remaining = getRemainingTime(quiz);
                if (quiz.status === 'active' && remaining !== null && remaining <= 0) {
                    await forceEndQuiz(quizId);
                    return;
                }

                const response = await Response.findOne({ quizId, userId: socket.user._id });
                socket.join(`quiz:${quizId}`);
                if (['faculty', 'admin'].includes(socket.user.role)) socket.join(`quiz:${quizId}:faculty`);

                socket.emit('quiz:sync_state', {
                    status: quiz.status,
                    currentQuestionIndex: quiz.currentQuestionIndex,
                    remainingTime: remaining,
                    lastAnswer: response?.answers?.length > 0 ? response.answers[response.answers.length - 1] : null,
                    totalScore: response?.totalScore || 0,
                    rank: response?.rank || '-'
                });
            } catch (error) {
                logger.error('Sync Error:', error);
            }
        });

        // 2. Join Quiz
        socket.on('quiz:join', async (data) => {
            const { quizId } = data;
            if (!quizId) return;

            // Rate limit by IP for safety but generous
            const ip = socket.handshake.address;
            const now = Date.now();
            const limit = socketRateLimit.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
            if (now > limit.resetAt) { limit.count = 0; limit.resetAt = now + RATE_LIMIT_WINDOW; }
            if (limit.count >= MAX_JOINS_PER_MIN) return socket.emit('error', { message: 'Rate limit exceeded' });
            limit.count++;
            socketRateLimit.set(ip, limit);

            try {
                const quiz = await Quiz.findById(quizId);
                if (!quiz) return socket.emit('error', { message: 'Quiz not found' });

                const remaining = getRemainingTime(quiz);
                if (quiz.status === 'active' && remaining !== null && remaining <= 0) {
                    await forceEndQuiz(quizId);
                    return socket.emit('error', { message: 'Quiz expired' });
                }

                // Room joining
                socket.join(`quiz:${quizId}`);
                if (['faculty', 'admin'].includes(socket.user.role)) socket.join(`quiz:${quizId}:faculty`);

                if (socket.user.role === 'student') {
                    socket.to(`quiz:${quizId}`).emit('participant:joined', {
                        participant: {
                            id: socket.user._id,
                            name: socket.user.name,
                            avatar: socket.user.avatar,
                            rollNumber: socket.user.rollNumber,
                            section: socket.user.section,
                            department: socket.user.department
                        }
                    });
                }

                // Initial participants list
                const responses = await Response.find({ quizId, status: { $ne: 'terminated' } })
                    .populate('userId', 'name avatar rollNumber section department role')
                    .limit(50) // Performance: only show first 50 immediately
                    .lean();

                socket.emit('quiz:joined', {
                    quizId,
                    status: quiz.status,
                    participants: responses.filter(r => r.userId?.role === 'student').map(r => ({
                        id: r.userId?._id,
                        name: r.userId?.name,
                        rollNumber: r.userId?.rollNumber,
                        status: r.status
                    }))
                });
            } catch (error) {
                logger.error('Join Error:', error);
            }
        });

        // 3. Start Quiz
        socket.on('quiz:start', async (data) => {
            try {
                if (!['faculty', 'admin'].includes(socket.user.role)) return;
                const { quizId } = data;
                const quiz = await Quiz.findById(quizId);
                if (!quiz) return;

                quiz.status = 'active';
                quiz.startedAt = new Date();
                quiz.currentQuestionIndex = 0;
                if (quiz.settings?.quizTimer > 0) {
                    quiz.expiresAt = new Date(Date.now() + quiz.settings.quizTimer * 1000);
                }
                await quiz.save();

                await Response.updateMany(
                    { quizId, status: 'waiting' },
                    { $set: { status: 'in-progress', startedAt: new Date() } }
                );

                io.to(`quiz:${quizId}`).emit('quiz:started', {
                    quizId,
                    startedAt: quiz.startedAt,
                    expiresAt: quiz.expiresAt,
                    currentQuestionIndex: 0,
                    questions: quiz.questions
                });
            } catch (error) {
                logger.error('Start Error:', error);
            }
        });

        // 4. Submit Answer (CONSOLIDATED & OPTIMIZED)
        socket.on('answer:submit', async (data) => {
            try {
                const { quizId, questionId, answer, timeTaken } = data;
                if (!quizId || !questionId) return;

                const quiz = await Quiz.findById(quizId).select('status questions settings expiresAt');
                if (!quiz || quiz.status !== 'active') return;

                const remaining = getRemainingTime(quiz);
                if (remaining !== null && remaining <= 0) {
                    await forceEndQuiz(quizId);
                    return;
                }

                const question = quiz.questions.id(questionId);
                if (!question) return;

                const isCorrect = checkAnswer(question, answer);
                const pointsEarned = isCorrect ? (question.points || 10) : 0;

                // Penalty logic for ultra-fast suspicious answers
                let trustDeduction = (timeTaken < 800) ? 10 : 0;

                const response = await Response.findOne({ quizId, userId: socket.user._id });
                if (!response) return;

                const answerObj = {
                    questionId,
                    answer: String(answer),
                    isCorrect,
                    pointsEarned,
                    timeTaken: timeTaken || 0,
                    answeredAt: new Date(),
                    questionIndex: quiz.questions.findIndex(q => q._id.toString() === questionId.toString())
                };

                const idx = response.answers.findIndex(a => a.questionId.toString() === questionId.toString());
                if (idx > -1) response.answers[idx] = answerObj;
                else response.answers.push(answerObj);

                if (trustDeduction > 0) response.trustScore = Math.max(0, response.trustScore - trustDeduction);
                response.totalScore = response.answers.reduce((s, a) => s + (a.pointsEarned || 0), 0);
                response.lastActivityAt = new Date();
                response.status = 'in-progress';

                await response.save();

                // 🚀 HIGH CONCURRENCY STRATEGY:
                // 1. Update Redis Leaderboard (Fastest)
                await LeaderboardService.updateScore(quizId, userIdStr, response.totalScore);

                // 2. Feedback to single student
                socket.emit('answer:feedback', { questionId, isCorrect, pointsEarned, totalScore: response.totalScore });

                // 3. Update host view (throttle this if too many)
                io.to(`quiz:${quizId}:faculty`).emit('response:received', {
                    participantId: socket.user._id,
                    participantName: socket.user.name,
                    questionId, isCorrect, pointsEarned
                });

                // 4. Update Leaderboard for all (Debounced for DB mode, Fast for Redis mode)
                const isRedisEnabled = !!(await LeaderboardService.getTop(quizId, 1)).length;
                if (isRedisEnabled) {
                    const lb = await LeaderboardService.getTop(quizId, 10);
                    io.to(`quiz:${quizId}`).emit('leaderboard:update', { leaderboard: lb });
                } else {
                    debounceRankUpdate(quizId);
                }

            } catch (error) {
                logger.error('Submit Error:', error);
            }
        });

        // 5. Anti-Cheat
        socket.on('tab:switched', async (data) => {
            try {
                const { quizId } = data;
                const quiz = await Quiz.findById(quizId);
                const response = await Response.findOne({ quizId, userId: socket.user._id });
                if (!quiz || !response) return;

                response.tabSwitchCount += 1;
                response.trustScore = Math.max(0, response.trustScore - 5);

                const max = quiz.settings?.maxTabSwitches || 0;
                const terminate = !quiz.settings?.allowTabSwitch || (max > 0 && response.tabSwitchCount > max);

                if (terminate) {
                    response.status = 'terminated';
                    response.terminationReason = 'tab-switch';
                    response.completedAt = new Date();
                }
                await response.save();

                socket.emit('tab:warning', {
                    count: response.tabSwitchCount,
                    terminated: terminate,
                    trustScore: response.trustScore
                });

                if (terminate) {
                    io.to(`user:${userIdStr}`).emit('quiz:terminated', { reason: 'Cheat Protection' });
                }
            } catch (err) { logger.error('Tab Switch Error:', err); }
        });

        socket.on('quiz:end', async (data) => {
            if (['faculty', 'admin'].includes(socket.user.role)) await forceEndQuiz(data.quizId);
        });

        socket.on('disconnect', () => {
            logger.info(`🔌 Socket disconnected: ${userIdStr}`);
        });
    });
};
