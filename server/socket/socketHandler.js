const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Quiz = require('../models/Quiz');
const Response = require('../models/Response');
const LeaderboardService = require('../services/leaderboardService');
const QuizResult = require('../models/QuizResult');
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
                const roomName = `quiz_${quizId}`;

                // RESTRICTED: Only send leaderboard updates to faculty host room
                // Students should NOT see the leaderboard (faculty-only feature)
                io.to(`${roomName}:host`).emit('leaderboardUpdate', leaderboard);
                io.to(`${roomName}:host`).emit('leaderboard:update', { leaderboard });

                logger.info(`📊 [LEADERBOARD] Broadcast to HOST ONLY: ${roomName}:host | Count: ${leaderboard.length}`);
                rankUpdateDebounces.delete(quizId);
            } catch (err) { logger.error('Debounce Rank Update Error:', err); }
        }, 1500);
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

        // 🛡️ [SECURITY] Multi-tab eviction (Strict enforcement for exam integrity)
        if (activeUserConnections.has(connectionKey)) {
            const oldSocketId = activeUserConnections.get(connectionKey);
            const oldSocket = io.sockets.sockets.get(oldSocketId);

            if (oldSocket && oldSocket.id !== socket.id) {
                logger.info(`🚨 [EVICTION] Closing old session for ${socket.user.name} to prevent multi-tab access`);

                // Notify the old tab before killing it
                oldSocket.emit('error', {
                    message: 'Your account was logged in from another device or tab. Disconnecting this session for security.'
                });

                // Allow a tiny delay for message to arrive before disconnect
                setTimeout(() => {
                    oldSocket.disconnect(true);
                }, 500);
            }
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
                    rank: userRole === 'student' ? '-' : (response?.rank || '-'),
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
            const roomName = `quiz_${quizId}`;

            socket.join(roomName);
            // Join original as well for compatibility
            socket.join(String(quizId));
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
                // Use quizTimer (total quiz duration) for overall expiry
                if (quiz.settings?.quizTimer > 0) {
                    quiz.expiresAt = new Date(Date.now() + quiz.settings.quizTimer * 1000);
                } else if (quiz.settings?.questionTimer > 0) {
                    // Fallback: if no quizTimer, use questionTimer * total questions
                    quiz.expiresAt = new Date(Date.now() + quiz.settings.questionTimer * (quiz.questions?.length || 1) * 1000);
                }
                await quiz.save();

                await Response.updateMany(
                    { quizId: quiz._id, status: 'waiting' },
                    { $set: { status: 'in-progress', startedAt: new Date() } }
                );

                io.to(roomName).emit('quiz:state_changed', {
                    status: STATES.LIVE,
                    currentQuestionIndex: 0,
                    expiresAt: quiz.expiresAt,
                    quizTimer: quiz.settings?.quizTimer || 0
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
        // --- 4. ANSWER SUBMISSION (STUDENT ONLY) ---
        const handleAnswerSubmit = async (data) => {
            if (userRole !== 'student') return;
            const { quizId, questionId, answer, timeTaken } = data;
            const roomName = `quiz_${quizId}`;
            try {
                const quiz = await Quiz.findById(quizId).select('status questions settings expiresAt currentQuestionIndex');
                const allowedStates = [STATES.ACTIVE, STATES.QUESTION_ACTIVE, STATES.LIVE];
                if (!quiz || !allowedStates.includes(quiz.status)) {
                    return socket.emit('error', { message: 'Selection blocked: Question is inactive' });
                }

                const question = quiz.questions.id(questionId);
                if (!question) return;

                const { isCorrect, scoreAwarded } = calculateScore(question, answer, timeTaken / 1000, quiz.settings);
                const response = await Response.findOne({ quizId, userId: socket.user._id });
                if (!response || response.status !== 'in-progress') return;

                let answerObj = response.answers.find(a => a.questionId.toString() === questionId);
                const answerData = {
                    questionId,
                    answer: String(answer),
                    isCorrect,
                    scoreAwarded,
                    timeTaken: Math.max(0, timeTaken || 0),
                    answeredAt: new Date(),
                    questionIndex: quiz.currentQuestionIndex
                };

                if (answerObj) {
                    Object.assign(answerObj, answerData);
                } else {
                    response.answers.push(answerData);
                }

                await response.save();

                // Acknowledge to student
                socket.emit('answer:feedback', { isCorrect, scoreAwarded, totalScore: response.totalScore });

                // Notify host room for live dashboard
                io.to(`${roomName}:host`).emit('response:received', {
                    participantId: userIdStr,
                    participantName: socket.user.name,
                    isCorrect,
                    score: response.totalScore,
                    progress: response.answers.filter(a => a.answer).length
                });

                // Trigger real-time rank/leaderboard updates
                debounceRankUpdate(quizId);
            } catch (err) { logger.error('Submit Answer Error:', err); }
        };

        socket.on('answerSelected', handleAnswerSubmit);
        socket.on('answer:submit', handleAnswerSubmit);

        // --- 4.5 SECURITY: TAB SWITCH DETECTION ---
        socket.on('tab:switched', async (data) => {
            if (userRole !== 'student') return;
            const { quizId } = data;
            const roomName = `quiz_${quizId}`;
            try {
                const quiz = await Quiz.findById(quizId).select('settings');
                if (!quiz) return;

                const response = await Response.findOne({ quizId, userId: socket.user._id });
                if (!response || response.status === 'completed' || response.status === 'terminated') return;

                // Increment tab switch count
                response.tabSwitchCount = (response.tabSwitchCount || 0) + 1;
                response.focusLostCount = (response.focusLostCount || 0) + 1;

                // Decrease trust score
                response.trustScore = Math.max(0, (response.trustScore || 100) - 15);

                // Log security incident
                response.securityIncidents.push({
                    event: 'TAB_SWITCH',
                    ip: socket.handshake.address,
                    userAgent: socket.handshake.headers?.['user-agent'] || 'unknown',
                    timestamp: new Date(),
                    details: `Tab switch #${response.tabSwitchCount}`
                });

                const maxSwitches = quiz.settings?.maxTabSwitches || 0;
                const shouldTerminate = maxSwitches > 0 && response.tabSwitchCount >= maxSwitches;

                if (shouldTerminate) {
                    response.status = 'terminated';
                    response.terminationReason = 'tab-switch';
                    response.completedAt = new Date();
                    await response.save();

                    socket.emit('quiz:terminated', {
                        reason: 'tab-switch',
                        message: `You have been removed from the quiz for switching tabs ${maxSwitches} times.`
                    });

                    // Notify faculty
                    io.to(`${roomName}:host`).emit('security:alert', {
                        type: 'TERMINATED',
                        studentId: socket.user._id,
                        studentName: socket.user.name,
                        reason: 'tab-switch',
                        tabSwitchCount: response.tabSwitchCount
                    });

                    logger.warn(`🚫 [SECURITY] ${socket.user.name} terminated for ${response.tabSwitchCount} tab switches in quiz ${quizId}`);
                } else {
                    await response.save();

                    // Warn the student
                    const remaining = maxSwitches > 0 ? maxSwitches - response.tabSwitchCount : 'unlimited';
                    socket.emit('security:warning', {
                        type: 'TAB_SWITCH',
                        count: response.tabSwitchCount,
                        remaining,
                        message: maxSwitches > 0
                            ? `Warning: Tab switch detected (${response.tabSwitchCount}/${maxSwitches}). ${remaining} remaining before termination.`
                            : `Tab switch detected. Your activity is being monitored.`
                    });

                    // Notify faculty
                    io.to(`${roomName}:host`).emit('security:alert', {
                        type: 'TAB_SWITCH',
                        studentId: socket.user._id,
                        studentName: socket.user.name,
                        tabSwitchCount: response.tabSwitchCount,
                        trustScore: response.trustScore
                    });

                    logger.warn(`⚠️ [SECURITY] ${socket.user.name} tab switch #${response.tabSwitchCount} in quiz ${quizId}`);
                }
            } catch (err) { logger.error('Tab Switch Handler Error:', err); }
        });

        // --- 5. QUIZ COMPLETION ---
        socket.on('quiz:complete', async (data) => {
            if (userRole !== 'student') return;
            const { quizId, answers } = data;
            const roomName = `quiz_${quizId}`;
            try {
                const quiz = await Quiz.findById(quizId);
                const response = await Response.findOne({ quizId, userId: socket.user._id });
                if (!response || !quiz) return;

                if (response.status !== 'completed' && response.status !== 'terminated') {
                    // 🚀 Process final batch if provided via socket too
                    if (answers && typeof answers === 'object') {
                        for (const [qId, userAns] of Object.entries(answers)) {
                            const question = quiz.questions.id(qId);
                            if (!question) continue;
                            const { isCorrect, scoreAwarded } = calculateScore(question, userAns, 0, quiz.settings);
                            let aObj = response.answers.find(a => a.questionId.toString() === qId);
                            if (aObj) {
                                aObj.answer = userAns;
                                aObj.isCorrect = isCorrect;
                                aObj.scoreAwarded = scoreAwarded;
                                aObj.answeredAt = aObj.answeredAt || new Date();
                            } else {
                                response.answers.push({
                                    questionId: qId,
                                    answer: userAns,
                                    isCorrect,
                                    scoreAwarded,
                                    answeredAt: new Date()
                                });
                            }
                        }
                    }

                    response.status = 'completed';
                    response.completedAt = new Date();
                    await response.save();

                    // PART 1: Aggregate total score using DB query & Store in QuizResult
                    const aggregatedData = await Response.aggregate([
                        { $match: { _id: response._id } },
                        {
                            $project: {
                                totalScore: { $sum: "$answers.scoreAwarded" },
                                correctCount: {
                                    $size: {
                                        $filter: {
                                            input: "$answers",
                                            as: "a",
                                            cond: { $eq: ["$$a.isCorrect", true] }
                                        }
                                    }
                                },
                                wrongCount: {
                                    $size: {
                                        $filter: {
                                            input: "$answers",
                                            as: "a",
                                            cond: { $eq: ["$$a.isCorrect", false] }
                                        }
                                    }
                                }
                            }
                        }
                    ]);

                    const stats = aggregatedData[0] || { totalScore: 0, correctCount: 0, wrongCount: 0 };

                    // Save to QuizResult collection as requested
                    await QuizResult.findOneAndUpdate(
                        { quizId: quiz._id, userId: socket.user._id },
                        {
                            rollNumber: socket.user.rollNumber,
                            studentName: socket.user.name,
                            totalScore: stats.totalScore,
                            correctCount: stats.correctCount,
                            incorrectCount: stats.wrongCount,
                            percentage: quiz.totalPoints > 0 ? (stats.totalScore / quiz.totalPoints) * 100 : 0,
                            totalTimeTaken: response.totalTimeTaken,
                            answers: response.answers.map(a => {
                                const q = quiz.questions.find(quest => String(quest._id) === String(a.questionId));
                                return {
                                    questionId: a.questionId,
                                    selectedOption: a.answer,
                                    correctOption: q ? q.correctAnswer : 'N/A',
                                    isCorrect: a.isCorrect,
                                    scoreAwarded: a.scoreAwarded,
                                    timeTaken: a.timeTaken
                                };
                            }),
                            completedAt: new Date()
                        },
                        { upsert: true, new: true }
                    );

                    await Response.updateRanks(quizId);
                    logger.info(`🏁 [COMPLETED] Quiz ${quizId} completed and results stored for ${socket.user.name}`);
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

                // PART 2: Emit leaderboard update after completion too
                debounceRankUpdate(quizId);
            } catch (err) { logger.error('Complete Quiz Error:', err); }
        });

        socket.on('disconnect', (reason) => {
            if (activeUserConnections.get(connectionKey) === socket.id) {
                activeUserConnections.delete(connectionKey);
            }
            logger.info(`🔌 [DISCONNECT] ${socket.user.name} | Reason: ${reason} | SocketID: ${socket.id}`);

            // Update last activity timestamp for student responses on disconnect
            // This helps preserve data on signal loss
            if (userRole === 'student') {
                Response.updateMany(
                    { userId: socket.user._id, status: 'in-progress' },
                    { $set: { lastActivityAt: new Date() } }
                ).catch(err => logger.error('Disconnect activity update error:', err));
            }
        });
    });
};
