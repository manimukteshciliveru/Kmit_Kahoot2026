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
    logger.info('🔌 [SOCKET] Handler initialized');

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
                const roomName = String(quizId);
                io.to(roomName).emit('leaderboard:update', { leaderboard });
                logger.info(`📊 [LEADERBOARD] Broadcast to room: ${roomName} | Count: ${leaderboard.length}`);
                rankUpdateDebounces.delete(quizId);
            } catch (err) { logger.error('Debounce Rank Update Error:', err); }
        }, 3000);
        rankUpdateDebounces.set(quizId, timeout);
    };

    const forceEndQuiz = async (quizId) => {
        const roomName = String(quizId);
        try {
            logger.info(`⏹️ [FORCE END] Terminating quiz arena: ${quizId}`);
            const quiz = await Quiz.findById(quizId);
            if (!quiz || quiz.status === STATES.DONE) return;

            quiz.status = STATES.DONE;
            quiz.endedAt = new Date();
            await quiz.save();

            await Response.updateMany(
                { quizId, status: { $in: ['waiting', 'in-progress'] } },
                { $set: { status: 'completed', completedAt: new Date() } }
            );

            await Response.updateRanks(quizId);
            const leaderboard = await Response.getLeaderboard(quizId, 500);

            io.to(roomName).emit('quiz:ended', {
                quizId,
                status: STATES.DONE,
                endedAt: quiz.endedAt,
                leaderboard
            });
            logger.info(`✅ [ARENA CLOSED] Broadcast ended signal to: ${roomName}`);
        } catch (error) { logger.error('Force End Error:', error); }
    };

    // --- Middleware: Auth & Guard ---
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers['authorization']?.split(' ')[1];
            if (!token) {
                logger.warn('🚫 [SOCKET] Connection rejected: No token');
                return next(new Error('Authentication required'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('name role avatar isActive department section rollNumber');

            if (!user || !user.isActive) {
                logger.warn(`🚫 [SOCKET] Connection rejected: User invalid or inactive (${decoded.id})`);
                return next(new Error('User restricted or not found'));
            }
            socket.user = user;
            next();
        } catch (err) {
            logger.error(`🚫 [SOCKET] Auth Logic Error: ${err.message}`);
            next(new Error(err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'Authentication failed'));
        }
    });

    io.on('connection', async (socket) => {
        const userIdStr = socket.user._id.toString();
        const userRole = socket.user.role;
        const connectionKey = `${userIdStr}_${userRole}`;

        // 🛡️ [SECURITY] Multi-tab notification (Inform but don't strictly evict to support multi-device)
        if (activeUserConnections.has(connectionKey)) {
            logger.info(`📱 [DUPLICATE] User ${socket.user.name} connected from another tab/device`);
        }
        activeUserConnections.set(connectionKey, socket.id);

        logger.info(`🔌 [CONNECT] ${socket.user.name} (${userRole}) | SocketID: ${socket.id}`);
        socket.join(`user:${userIdStr}`);

        // --- 1. QUIZ SYNC (GROUND TRUTH) ---
        socket.on('quiz:sync', async (data) => {
            const { quizId } = data;
            const roomName = String(quizId);
            try {
                const quiz = await Quiz.findById(quizId).lean();
                if (!quiz) return socket.emit('error', { message: 'Quiz not found' });

                socket.join(roomName);
                if (userRole !== 'student') {
                    socket.join(`${roomName}:host`);
                    logger.info(`👑 [HOST JOIN] ${socket.user.name} entered host room: ${roomName}:host`);
                }

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
                    responseId: response?._id
                });
                logger.info(`🔄 [SYNC] Ground truth sent to ${socket.user.name} for arena: ${roomName}`);
            } catch (err) { logger.error('Sync error:', err); }
        });

        // --- 2. QUIZ JOIN ---
        socket.on('quiz:join', async (data) => {
            const { quizId } = data;
            if (!quizId) return;
            const roomName = String(quizId);

            socket.join(roomName);
            logger.info(`📥 [ROOM JOIN] User ${socket.user.name} joined room: ${roomName}`);

            if (userRole !== 'student') {
                socket.join(`${roomName}:host`);
                logger.info(`👑 [HOST ROOM] Faculty ${socket.user.name} joined host sub-room: ${roomName}:host`);
            }

            const quiz = await Quiz.findById(quizId).select('status code participants').lean();
            if (!quiz) return;

            if (userRole === 'student') {
                io.to(`${roomName}:host`).emit('participant:joined', {
                    participant: {
                        id: socket.user._id,
                        name: socket.user.name,
                        avatar: socket.user.avatar,
                        rollNumber: socket.user.rollNumber,
                        department: socket.user.department,
                        section: socket.user.section
                    }
                });

                // 📡 Broadcast updated count to everyone
                const updatedQuiz = await Quiz.findById(quizId).select('participants').lean();
                io.to(roomName).emit('participant:count_update', {
                    count: updatedQuiz.participants?.length || 0
                });

                logger.info(`➕ [PARTICIPANT] Student ${socket.user.name} joined arena: ${roomName}`);
            }
        });

        // --- 3. LIFECYCLE CONTROLS (FACULTY ONLY) ---
        socket.on('quiz:start', async (data) => {
            if (userRole === 'student') return;
            const { quizId } = data;
            const roomName = String(quizId);
            try {
                logger.info(`🚀 [LAUNCH] Faculty ${socket.user.name} starting quiz ${quizId}`);
                const quiz = await Quiz.findById(quizId);
                const allowedStartStates = [STATES.WAITING, STATES.DRAFT, STATES.SCHEDULED];

                if (!quiz || !allowedStartStates.includes(quiz.status)) {
                    logger.warn(`⛔ [START REJECTED] Quiz ${quizId} status is ${quiz?.status}`);
                    return socket.emit('error', { message: 'Invalid transition: Quiz is already active or finished' });
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
                logger.info(`📢 [STARTED] Broadcast state change to room: ${roomName}`);
            } catch (err) { logger.error('Start Error:', err); }
        });

        socket.on('quiz:end', async (data) => {
            if (userRole === 'student') return;
            const { quizId } = data;
            logger.info(`⏹️ [END REQUEST] Faculty ${socket.user.name} requested manual end for: ${quizId}`);
            await forceEndQuiz(quizId);
        });

        socket.on('quiz:next-question', async (data) => {
            if (userRole === 'student') return;
            const { quizId } = data;
            const roomName = String(quizId);
            try {
                const quiz = await Quiz.findById(quizId);
                if (!quiz) return;

                if (quiz.status === STATES.LEADERBOARD || quiz.status === STATES.LIVE) {
                    const nextIdx = (quiz.status === STATES.LIVE) ? 0 : quiz.currentQuestionIndex + 1;

                    if (nextIdx >= quiz.questions.length && quiz.status !== STATES.LIVE) {
                        return await forceEndQuiz(quizId);
                    }

                    quiz.status = STATES.QUESTION_ACTIVE;
                    quiz.currentQuestionIndex = (quiz.status === STATES.LIVE) ? 0 : nextIdx;
                    quiz.expiresAt = quiz.settings?.questionTimer > 0 ? new Date(Date.now() + quiz.settings.questionTimer * 1000) : null;
                    await quiz.save();

                    io.to(roomName).emit('quiz:state_changed', {
                        status: STATES.QUESTION_ACTIVE,
                        currentQuestionIndex: quiz.currentQuestionIndex,
                        expiresAt: quiz.expiresAt
                    });
                    logger.info(`⏭️ [NEXT QUESTION] Moved to Q${quiz.currentQuestionIndex + 1} in room: ${roomName}`);
                } else if (quiz.status === STATES.QUESTION_ACTIVE) {
                    quiz.status = STATES.LEADERBOARD;
                    quiz.expiresAt = null;
                    await quiz.save();

                    const leaderboard = await Response.getLeaderboard(quizId, 500);
                    io.to(roomName).emit('quiz:state_changed', {
                        status: STATES.LEADERBOARD,
                        leaderboard
                    });
                    logger.info(`📊 [LEADERBOARD MODE] Broadcast leaderboard to room: ${roomName}`);
                }
            } catch (err) { logger.error('Next-Q Error:', err); }
        });

        // --- 4. ANSWER SUBMISSION (STUDENT ONLY) ---
        socket.on('answer:submit', async (data) => {
            if (userRole !== 'student') return;
            const { quizId, questionId, answer, timeTaken } = data;
            const roomName = String(quizId);
            try {
                const quiz = await Quiz.findById(quizId).select('status questions settings expiresAt currentQuestionIndex');

                const allowedStates = [STATES.ACTIVE, STATES.QUESTION_ACTIVE, STATES.LIVE];
                if (!quiz || !allowedStates.includes(quiz.status)) {
                    return socket.emit('error', { message: 'Selection blocked: Question is inactive' });
                }

                const question = quiz.questions.id(questionId);
                if (!question) return;

                const { isCorrect, pointsEarned } = calculateScore(question, answer, timeTaken / 1000, quiz.settings);
                const response = await Response.findOne({ quizId, userId: socket.user._id });

                if (!response || response.status !== 'in-progress') return;

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

                // Acknowledge to student
                socket.emit('answer:feedback', { isCorrect, pointsEarned, totalScore: response.totalScore });

                // Notify host room
                io.to(`${roomName}:host`).emit('response:received', {
                    participantId: userIdStr,
                    participantName: socket.user.name,
                    isCorrect,
                    score: response.totalScore,
                    progress: response.answers.filter(a => a.answer).length
                });

                debounceRankUpdate(quizId);
            } catch (err) { logger.error('Submit Answer Error:', err); }
        });

        // --- 5. QUIZ COMPLETION ---
        socket.on('quiz:complete', async (data) => {
            if (userRole !== 'student') return;
            const { quizId } = data;
            const roomName = String(quizId);
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
                io.to(`${roomName}:host`).emit('student:completed', {
                    studentId: userIdStr,
                    name: socket.user.name,
                    score: response.totalScore
                });
            } catch (err) { logger.error('Complete Quiz Error:', err); }
        });

        socket.on('disconnect', (reason) => {
            if (activeUserConnections.get(connectionKey) === socket.id) {
                activeUserConnections.delete(connectionKey);
            }
            logger.info(`🔌 [DISCONNECT] ${socket.user.name} | Reason: ${reason} | SocketID: ${socket.id}`);
        });
    });
};
