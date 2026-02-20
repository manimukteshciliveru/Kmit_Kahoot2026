const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Quiz = require('../models/Quiz');
const Response = require('../models/Response');
const LeaderboardService = require('../services/leaderboardService');
const { calculateScore } = require('../utils/calculateScore');
const logger = require('../utils/logger');

// 🏁 Global Quiz State Machine Definitions
const STATES = {
    DRAFT: 'draft',
    SCHEDULED: 'scheduled',
    WAITING: 'waiting',
    STARTED: 'started',
    ACTIVE: 'active',
    QUESTION_ACTIVE: 'question_active',
    LEADERBOARD: 'leaderboard',
    FINISHED: 'finished',
    COMPLETED: 'completed',
    LIVE: 'live',
    DONE: 'done'
};

// Tracking active socket connections to prevent multi-tab conflicts
// Key: userId_role (Allows same user to be Faculty on one tab and Student on another if needed)
const activeUserConnections = new Map();

// Debounce for rank updates to preserve DB throughput
const rankUpdateDebounces = new Map();
const socketRateLimit = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_JOINS_PER_MIN = 100;

module.exports = (io) => {

    const getRemainingTime = (quiz) => {
        if (!quiz.expiresAt) return null;
        const now = new Date();
        const diff = new Date(quiz.expiresAt).getTime() - now.getTime();
        return Math.max(0, diff);
    };

    const debounceRankUpdate = (quizId) => {
        if (rankUpdateDebounces.has(quizId)) return;
        const timeout = setTimeout(async () => {
            try {
                await Response.updateRanks(quizId);
                const leaderboard = await Response.getLeaderboard(quizId, 500);
                const roomName = `quiz_${quizId}`;
                io.to(roomName).emit('leaderboard:update', { leaderboard });
                logger.info(`📊 [LEADERBOARD] Updated & Emitted to room: ${roomName}`);
                rankUpdateDebounces.delete(quizId);
            } catch (err) { logger.error('Debounce Rank Update Error:', err); }
        }, 3000);
        rankUpdateDebounces.set(quizId, timeout);
    };

    const forceEndQuiz = async (quizId) => {
        try {
            const quiz = await Quiz.findById(quizId);
            if (!quiz || quiz.status === STATES.FINISHED) return;

            quiz.status = STATES.DONE;
            quiz.endedAt = new Date();
            await quiz.save();

            await Response.updateMany(
                { quizId, status: { $in: ['waiting', 'in-progress'] } },
                { $set: { status: 'completed', completedAt: new Date() } }
            );

            await Response.updateRanks(quizId);
            const leaderboard = await Response.getLeaderboard(quizId, 500);

            io.to(`quiz_${quizId}`).emit('quiz:ended', {
                quizId,
                status: STATES.DONE,
                endedAt: quiz.endedAt,
                leaderboard
            });
        } catch (error) { logger.error('Force End Error:', error); }
    };

    // --- Middleware: Auth & Guard ---
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers['authorization']?.split(' ')[1];
            if (!token) return next(new Error('Authentication required'));

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('name role avatar isActive department section rollNumber');

            if (!user || !user.isActive) return next(new Error('User restricted or not found'));
            socket.user = user;
            next();
        } catch (err) {
            next(new Error(err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'Authentication failed'));
        }
    });

    io.on('connection', async (socket) => {
        const userIdStr = socket.user._id.toString();
        const userRole = socket.user.role;
        const connectionKey = `${userIdStr}_${userRole}`;

        // 🛡️ [SECURITY] Multi-tab prevention: Notify & Evict previous session for SAME role
        if (activeUserConnections.has(connectionKey)) {
            const oldSocketId = activeUserConnections.get(connectionKey);
            if (oldSocketId !== socket.id) {
                const oldSocket = io.sockets.sockets.get(oldSocketId);
                if (oldSocket) {
                    oldSocket.emit('session:terminated', {
                        reason: 'duplicate',
                        message: 'Another session detected with this role. Disconnected.'
                    });
                    oldSocket.disconnect(true);
                }
            }
        }
        activeUserConnections.set(connectionKey, socket.id);

        logger.info(`🔌 [CONNECT] ${socket.user.name} (${userRole}) | ID: ${socket.id}`);
        socket.join(`user:${userIdStr}`);

        // --- 1. QUIZ SYNC (GROUND TRUTH) ---
        socket.on('quiz:sync', async (data) => {
            const { quizId } = data;
            const roomName = `quiz_${quizId}`;
            try {
                const quiz = await Quiz.findById(quizId).lean();
                if (!quiz) return socket.emit('error', { message: 'Quiz not found' });

                socket.join(roomName);
                if (userRole !== 'student') socket.join(`${roomName}:faculty`);

                const response = await Response.findOne({ quizId, userId: socket.user._id }).lean();
                const remaining = getRemainingTime(quiz);

                socket.emit('quiz:sync_state', {
                    status: quiz.status,
                    currentQuestionIndex: quiz.currentQuestionIndex || 0,
                    remainingTime: remaining,
                    totalScore: response?.totalScore || 0,
                    rank: response?.rank || '-',
                    savedAnswers: response?.answers || [],
                    isTerminated: response?.status === 'terminated',
                    isCompleted: response?.status === 'completed',
                    responseId: response?._id // For frontend navigation
                });
                logger.info(`🔄 [SYNC] Ground truth sent to ${socket.user.name} for room: ${roomName}`);
            } catch (err) { logger.error('Sync error:', err); }
        });

        // --- 2. QUIZ JOIN ---
        socket.on('quiz:join', async (data) => {
            const { quizId } = data;
            if (!quizId) return;
            const roomName = `quiz_${quizId}`;
            socket.join(roomName);
            if (userRole !== 'student') socket.join(`${roomName}:faculty`);

            const quiz = await Quiz.findById(quizId).select('status code participants').lean();
            if (!quiz) return;

            if (userRole === 'student') {
                io.to(`${roomName}:faculty`).emit('participant:joined', {
                    participant: {
                        id: socket.user._id,
                        name: socket.user.name,
                        avatar: socket.user.avatar,
                        rollNumber: socket.user.rollNumber,
                        department: socket.user.department,
                        section: socket.user.section
                    }
                });

                // 📡 Broadcast updated count to everyone (especially students in lobby)
                const updatedQuiz = await Quiz.findById(quizId).select('participants').lean();
                io.to(roomName).emit('participant:count_update', {
                    count: updatedQuiz.participants?.length || 0
                });

                logger.info(`➕ [JOIN] Student ${socket.user.name} joined room: ${roomName}`);
            }
        });

        // --- 3. LIFECYCLE CONTROLS (FACULTY ONLY) ---
        socket.on('quiz:start', async (data) => {
            if (userRole === 'student') return;
            const { quizId } = data;
            const roomName = `quiz_${quizId}`;
            try {
                const quiz = await Quiz.findById(quizId);
                const allowedStartStates = [STATES.WAITING, STATES.DRAFT, STATES.SCHEDULED];
                if (!quiz || !allowedStartStates.includes(quiz.status)) {
                    logger.warn(`⛔ [START REJECTED] Quiz ${quizId} status is ${quiz?.status}`);
                    return socket.emit('error', { message: 'Invalid transition: Quiz must be in draft, waiting or scheduled state to start' });
                }

                quiz.status = STATES.LIVE;
                quiz.startedAt = new Date();
                quiz.currentQuestionIndex = 0;
                if (quiz.settings?.questionTimer > 0) {
                    quiz.expiresAt = new Date(Date.now() + quiz.settings.questionTimer * 1000);
                }
                await quiz.save();

                await Response.updateMany(
                    { quizId: quiz._id, status: 'waiting' },
                    { $set: { status: 'in-progress', startedAt: new Date() } }
                );

                io.to(roomName).emit('quiz:state_changed', {
                    status: STATES.LIVE,
                    currentQuestionIndex: 0,
                    expiresAt: quiz.expiresAt
                });
                logger.info(`🚀 [STARTED] Quiz ${quizId} is now active.`);
            } catch (err) { logger.error('Start Error:', err); }
        });

        socket.on('quiz:next-question', async (data) => {
            if (userRole === 'student') return;
            const { quizId } = data;
            const roomName = `quiz_${quizId}`;
            try {
                const quiz = await Quiz.findById(quizId);
                if (!quiz) return;

                if (quiz.status === STATES.LEADERBOARD) {
                    const nextIdx = quiz.currentQuestionIndex + 1;
                    if (nextIdx >= quiz.questions.length) {
                        return await forceEndQuiz(quizId);
                    }
                    quiz.status = STATES.QUESTION_ACTIVE;
                    quiz.currentQuestionIndex = nextIdx;
                    quiz.expiresAt = quiz.settings?.questionTimer > 0 ? new Date(Date.now() + quiz.settings.questionTimer * 1000) : null;
                    await quiz.save();

                    io.to(roomName).emit('quiz:state_changed', {
                        status: STATES.QUESTION_ACTIVE,
                        currentQuestionIndex: nextIdx,
                        expiresAt: quiz.expiresAt
                    });
                } else if (quiz.status === STATES.QUESTION_ACTIVE) {
                    quiz.status = STATES.LEADERBOARD;
                    quiz.expiresAt = null;
                    await quiz.save();

                    const leaderboard = await Response.getLeaderboard(quizId, 500);
                    io.to(roomName).emit('quiz:state_changed', {
                        status: STATES.LEADERBOARD,
                        leaderboard
                    });
                }
            } catch (err) { logger.error('Next-Q Error:', err); }
        });

        // --- 4. ANSWER SUBMISSION (STUDENT ONLY) ---
        socket.on('answer:submit', async (data) => {
            if (userRole !== 'student') return;
            const { quizId, questionId, answer, timeTaken } = data;
            const roomName = `quiz_${quizId}`;
            try {
                logger.debug(`📩 [ANSWER RECEIVED] From ${socket.user.name} for Q: ${questionId}`);

                const quiz = await Quiz.findById(quizId).select('status questions settings expiresAt currentQuestionIndex');

                // 🛡️ REJECT if not in allowed state
                const allowedStates = [STATES.ACTIVE, STATES.QUESTION_ACTIVE, STATES.DRAFT, STATES.WAITING, STATES.SCHEDULED];
                if (!quiz || !allowedStates.includes(quiz.status)) {
                    logger.warn(`⛔ [ANSWER REJECTED] Quiz status is ${quiz?.status}`);
                    return socket.emit('error', { message: 'Selection blocked: Question is inactive' });
                }

                const question = quiz.questions.id(questionId);
                if (!question) return;

                // Score Calculation
                const { isCorrect, pointsEarned } = calculateScore(question, answer, timeTaken / 1000, quiz.settings);

                const response = await Response.findOne({ quizId, userId: socket.user._id });
                if (!response || response.status !== 'in-progress') {
                    logger.warn(`⛔ [ANSWER REJECTED] Invalid response status: ${response?.status}`);
                    return;
                }

                let answerObj = response.answers.find(a => a.questionId.toString() === questionId);
                if (answerObj && answerObj.answeredAt) {
                    return socket.emit('error', { message: 'Already answered' });
                }

                const answerData = {
                    questionId,
                    answer: String(answer),
                    isCorrect,
                    pointsEarned,
                    timeTaken: timeTaken || 0,
                    answeredAt: new Date(),
                    questionIndex: quiz.currentQuestionIndex
                };

                if (answerObj) {
                    Object.assign(answerObj, answerData);
                } else {
                    response.answers.push(answerData);
                }

                response.totalScore = response.answers.reduce((s, a) => s + (a.pointsEarned || 0), 0);
                await response.save();

                logger.info(`✅ [ANSWER SAVED] ${socket.user.name} | Score: ${response.totalScore} | Correct: ${isCorrect}`);

                // Acknowledge to student
                socket.emit('answer:ack', { success: true, isCorrect, pointsEarned, totalScore: response.totalScore });

                // Redundant/Legacy feedback support
                socket.emit('answer:feedback', { isCorrect, pointsEarned, totalScore: response.totalScore });

                // Notify faculty room
                io.to(`${roomName}:faculty`).emit('response:received', {
                    participantId: userIdStr,
                    participantName: socket.user.name,
                    isCorrect,
                    score: response.totalScore,
                    progress: response.answers.filter(a => a.answer).length
                });

                // Update Leaderboard broadly
                debounceRankUpdate(quizId);
            } catch (err) { logger.error('Submit Answer Error:', err); }
        });

        // --- 5. QUIZ COMPLETION ---
        socket.on('quiz:complete', async (data) => {
            const { quizId } = data;
            const roomName = `quiz_` + quizId;
            try {
                const response = await Response.findOne({ quizId, userId: socket.user._id });
                if (!response) return;

                if (response.status !== 'completed' && response.status !== 'terminated') {
                    response.status = 'completed';
                    response.completedAt = new Date();
                    await response.save();

                    await Response.updateRanks(quizId);
                    logger.info(`🏁 [COMPLETED] Quiz ${quizId} completed by ${socket.user.name}`);
                }

                const finalResults = {
                    totalScore: response.totalScore,
                    correctCount: response.answers.filter(a => a.isCorrect).length,
                    rank: response.rank,
                    responseId: response._id
                };

                socket.emit('quiz:completed', finalResults);
                io.to(`${roomName}:faculty`).emit('student:completed', { studentId: userIdStr, name: socket.user.name });
            } catch (err) { logger.error('Complete Quiz Error:', err); }
        });

        socket.on('disconnect', (reason) => {
            if (activeUserConnections.get(connectionKey) === socket.id) {
                activeUserConnections.delete(connectionKey);
            }
            logger.info(`🔌 [DISCONNECT] ${socket.user.name} | Reason: ${reason}`);
        });
    });
};
