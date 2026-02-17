const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Quiz = require('../models/Quiz');
const Response = require('../models/Response');

// Simple In-Memory Rate Limiting for Socket Events
// In a distributed setup, this should use Redis via rate-limit-redis
const socketRateLimit = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_JOINS_PER_MIN = 30; // 30 joins per minute per IP

module.exports = (io) => {

    // --- Helper Functions (Stateless) ---

    // Calculate remaining time based on DB timestamps
    const getRemainingTime = (quiz) => {
        if (!quiz.startedAt || !quiz.settings?.quizTimer) return null;

        const now = new Date();
        const startTime = new Date(quiz.startedAt);
        const durationMs = quiz.settings.quizTimer * 1000;
        const expiresAt = new Date(startTime.getTime() + durationMs);

        const remainingMs = expiresAt.getTime() - now.getTime();
        return remainingMs > 0 ? remainingMs : 0;
    };

    const checkAnswer = (question, answer) => {
        if (!answer) return false;
        const normalize = (str) => str.toString().toLowerCase().trim();

        if (question.type === 'mcq') {
            return normalize(answer) === normalize(question.correctAnswer);
        } else if (question.type === 'msq') {
            const userAnswers = answer.split(',').map(a => normalize(a)).sort();
            const correctAnswers = question.correctAnswer.split(',').map(a => normalize(a)).sort();
            if (userAnswers.length !== correctAnswers.length) return false;
            return userAnswers.every((val, index) => val === correctAnswers[index]);
        } else if (question.type === 'fill-blank') {
            const correctAnswers = question.correctAnswer.split('|').map(a => normalize(a));
            return correctAnswers.includes(normalize(answer));
        } else if (question.type === 'qa') {
            // Basic keyword matching
            const userAns = normalize(answer);
            const correct = normalize(question.correctAnswer);
            return userAns.includes(correct) || correct.includes(userAns);
        }
        return false;
    };

    // Core logic to end a quiz safely
    const forceEndQuiz = async (quizId) => {
        try {
            const quiz = await Quiz.findById(quizId);
            if (!quiz || quiz.status === 'finished') return;

            console.log(`⏰ [AUTO-END] Force ending quiz: ${quiz.title}`);

            quiz.status = 'finished';
            quiz.endedAt = new Date();
            await quiz.save();

            await Response.updateMany(
                { quizId, status: 'in-progress' },
                { $set: { status: 'completed', completedAt: new Date() } }
            );

            await Response.updateRanks(quizId);
            const leaderboard = await Response.getLeaderboard(quizId);

            io.to(`quiz:${quizId}`).emit('quiz:ended', {
                quizId,
                endedAt: quiz.endedAt,
                leaderboard,
                autoEnded: true
            });

            // Disconnect students
            const sockets = await io.in(`quiz:${quizId}`).fetchSockets();
            sockets.forEach(s => {
                if (s.user?.role === 'student') s.leave(`quiz:${quizId}`);
            });

            io.emit('quiz:status_update', { quizId, status: 'finished' });

        } catch (error) {
            console.error('❌ [AUTO-END] Error:', error);
        }
    };


    // --- Middleware ---

    // Socket Authentication Middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) return next(new Error('Authentication required'));

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('name role avatar isActive department section rollNumber');

            if (!user || !user.isActive) return next(new Error('User not found or inactive'));

            socket.user = user;
            socket.sessionId = socket.handshake.auth.sessionId;
            next();
        } catch (error) {
            next(new Error('Invalid token'));
        }
    });

    // --- Connection Handler ---

    io.on('connection', (socket) => {
        console.log(`🔌 User connected: ${socket.user.name} (${socket.user.role})`);

        const userId = socket.user._id.toString();
        socket.join(`user:${userId}`);

        // 1. FAULT TOLERANCE: Sync Event
        // Clients call this on reconnect to get current state
        socket.on('quiz:sync', async (data) => {
            const { quizId } = data;
            try {
                const quiz = await Quiz.findById(quizId);
                if (!quiz) {
                    socket.emit('error', { message: 'Quiz not found' });
                    return;
                }

                // If finished, send end state immediately
                if (quiz.status === 'finished' || quiz.status === 'completed') {
                    socket.emit('quiz:ended', {
                        quizId,
                        endedAt: quiz.endedAt || new Date()
                    });
                    return;
                }

                // Check stateless expiry
                const remaining = getRemainingTime(quiz);
                if (quiz.status === 'active' && remaining !== null && remaining <= 0) {
                    await forceEndQuiz(quizId);
                    return;
                }

                // Get user's last state
                const response = await Response.findOne({ quizId, userId: socket.user._id });

                // Re-join room
                socket.join(`quiz:${quizId}`);
                if (socket.user.role === 'faculty') socket.join(`quiz:${quizId}:faculty`);

                // Send sync payload
                socket.emit('quiz:sync_state', {
                    status: quiz.status,
                    currentQuestionIndex: quiz.currentQuestionIndex,
                    remainingTime: remaining,
                    lastAnswer: response?.answers?.length > 0 ? response.answers[response.answers.length - 1] : null,
                    totalScore: response?.totalScore || 0,
                    rank: response?.rank || '-'
                });

            } catch (error) {
                console.error('Sync Error:', error);
            }
        });

        // 2. SCALABILITY: Rate Limited Join
        socket.on('quiz:join', async (data) => {
            // Leaky Bucket Rate Limiting
            const ip = socket.handshake.address;
            const now = Date.now();
            const limit = socketRateLimit.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW };

            if (now > limit.resetAt) {
                limit.count = 0;
                limit.resetAt = now + RATE_LIMIT_WINDOW;
            }

            if (limit.count >= MAX_JOINS_PER_MIN) {
                socket.emit('error', { message: 'Too many join attempts. Please wait a moment.' });
                return;
            }
            limit.count++;
            socketRateLimit.set(ip, limit);

            try {
                const { quizId } = data;
                const quiz = await Quiz.findById(quizId);

                if (!quiz) {
                    socket.emit('error', { message: 'Quiz not found' });
                    return;
                }

                // Check Expiry (Stateless)
                const remaining = getRemainingTime(quiz);
                if (quiz.status === 'active' && remaining !== null && remaining <= 0) {
                    await forceEndQuiz(quizId);
                    socket.emit('error', { message: 'Quiz has time-expired' });
                    return;
                }

                // Student Access Control
                if (socket.user.role === 'student') {
                    if (quiz.status === 'finished') {
                        socket.emit('error', { message: 'This quiz has already ended.' });
                        return;
                    }

                    // Access Logic
                    const access = quiz.accessControl;
                    if (access && !access.isPublic) {
                        const userBranch = socket.user.department;
                        const userSection = socket.user.section;

                        if (access.mode === 'SPECIFIC') {
                            const isAllowed = access.allowedStudents.some(id => id.toString() === userId);
                            if (!isAllowed) {
                                socket.emit('error', { message: 'Restricted Access' });
                                return;
                            }
                        } else {
                            const allowedBranch = access.allowedBranches.find(b => b.name === userBranch);
                            if (!allowedBranch) {
                                socket.emit('error', { message: `Branch ${userBranch} not allowed.` });
                                return;
                            }
                            if (allowedBranch.sections.length > 0 && !allowedBranch.sections.includes(userSection)) {
                                socket.emit('error', { message: `Section ${userSection} not allowed.` });
                                return;
                            }
                        }
                    }
                }

                socket.join(`quiz:${quizId}`);
                if (['faculty', 'admin'].includes(socket.user.role)) {
                    socket.join(`quiz:${quizId}:faculty`);
                }

                socket.to(`quiz:${quizId}`).emit('participant:joined', {
                    participant: {
                        id: socket.user._id,
                        name: socket.user.name,
                        avatar: socket.user.avatar,
                        role: socket.user.role
                    }
                });

                // Performance: Limit initial participant load
                const responses = await Response.find({ quizId, status: { $in: ['waiting', 'in-progress', 'completed'] } })
                    .select('userId status createdAt')
                    .populate('userId', 'name avatar rollNumber section department')
                    .limit(100);

                socket.emit('quiz:joined', {
                    quizId,
                    participants: responses.map(r => ({
                        id: r.userId?._id,
                        name: r.userId?.name,
                        status: r.status,
                        joinedAt: r.createdAt
                    }))
                });

            } catch (error) {
                console.error('Join Error:', error);
                socket.emit('error', { message: 'Join failed' });
            }
        });

        // 3. FAULT TOLERANCE: Stateless Start
        socket.on('quiz:start', async (data) => {
            try {
                if (!['faculty', 'admin'].includes(socket.user.role)) return;

                const { quizId } = data;
                const quiz = await Quiz.findById(quizId);

                quiz.status = 'active';
                quiz.startedAt = new Date();
                quiz.currentQuestionIndex = 0;

                // Expiry is dynamic, no setTimeout needed
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
                    currentQuestionIndex: 0,
                    totalQuestions: quiz.questions.length,
                    questions: quiz.questions,
                    settings: quiz.settings,
                    expiresAt: quiz.expiresAt // Clients use this to sync timers
                });

            } catch (error) {
                console.error('Start Error:', error);
            }
        });

        // 4. SCALABILITY: Optimized Submit
        socket.on('answer:submit', async (data) => {
            try {
                const { quizId, questionId, answer, timeTaken } = data;

                // Stateless time check
                const quiz = await Quiz.findById(quizId);
                if (quiz.status !== 'active') return;

                const remaining = getRemainingTime(quiz);
                if (remaining !== null && remaining <= 0) {
                    await forceEndQuiz(quizId);
                    return;
                }

                const question = quiz.questions.id(questionId);
                if (!question) return;

                const isCorrect = checkAnswer(question, answer);
                const pointsEarned = isCorrect ? question.points : 0;

                const response = await Response.findOneAndUpdate(
                    { quizId, userId: socket.user._id, "answers.questionId": questionId },
                    {
                        $set: {
                            "answers.$.answer": answer,
                            "answers.$.isCorrect": isCorrect,
                            "answers.$.pointsEarned": pointsEarned,
                            "answers.$.timeTaken": timeTaken || 0,
                            "answers.$.answeredAt": new Date(),
                            lastActivityAt: new Date(),
                            status: 'in-progress'
                        }
                    },
                    { new: true }
                );

                if (!response) return;

                socket.emit('answer:feedback', {
                    questionId, isCorrect, pointsEarned, totalScore: response.totalScore
                });

                io.to(`quiz:${quizId}:faculty`).emit('response:received', {
                    participantId: socket.user._id,
                    participantName: socket.user.name,
                    questionId, isCorrect, pointsEarned
                });

                // Fire and forget rank update
                Response.updateRanks(quizId).then(async () => {
                    const leaderboard = await Response.getLeaderboard(quizId, 10);
                    io.to(`quiz:${quizId}`).emit('leaderboard:update', { leaderboard });
                }).catch(e => console.error(e));

            } catch (error) {
                console.error('Submit Error:', error);
            }
        });

        // Helper: Calculate Trust Score Deductions
        const calculateTrustScore = (response, activityType, data = {}) => {
            let score = response.trustScore || 100;

            switch (activityType) {
                case 'tab-switch':
                    score -= 5;
                    break;
                case 'focus-lost':
                    score -= 2;
                    break;
                case 'rapid-answer':
                    // Impossible to answer in < 1s for most questions
                    if (data.timeTaken < 1000) score -= 10;
                    break;
            }
            return Math.max(0, score);
        };

        // Helper: Trigger AI Summary Generation
        const AIAnalyticsService = require('../services/aiAnalyticsService');
        const triggerAiSummary = async (quizId, userId) => {
            try {
                console.log(`🤖 [AI] Generating performance summary for user ${userId} in quiz ${quizId}...`);
                const summary = await AIAnalyticsService.generateStudentSummary(quizId, userId);

                if (summary) {
                    await Response.findOneAndUpdate(
                        { quizId, userId },
                        {
                            $set: {
                                aiFeedback: JSON.stringify(summary)
                            }
                        }
                    );
                    console.log(`✅ [AI] Summary saved for user ${userId}`);
                    // Notify user if they are still connected?
                    io.to(`user:${userId}`).emit('ai:summary_ready', { summary });
                }
            } catch (error) {
                console.error('❌ [AI] Summary generation failed:', error);
            }
        };

        // ... (Existing helpers: getRemainingTime, checkAndForceEnd, endQuizLogic)

        // socket.on('connection') ...

        // 5. ANTI-CHEAT: Focus Lost
        socket.on('focus:lost', async (data) => {
            try {
                const { quizId } = data;
                const response = await Response.findOneAndUpdate(
                    { quizId, userId: socket.user._id },
                    { $inc: { focusLostCount: 1 } },
                    { new: true }
                );

                if (response) {
                    response.trustScore = calculateTrustScore(response, 'focus-lost');
                    await response.save();

                    if (response.trustScore < 40) {
                        io.to(`quiz:${quizId}:faculty`).emit('participant:flagged', {
                            participantId: socket.user._id,
                            reason: 'Low Trust Score (Focus Loss)',
                            score: response.trustScore
                        });
                    }
                }
            } catch (error) {
                console.error('Focus lost error:', error);
            }
        });

        // Updated Tab Switch
        socket.on('tab:switched', async (data) => {
            const { quizId } = data;
            const quiz = await Quiz.findById(quizId);
            if (!quiz) return;

            let response = await Response.findOne({ quizId, userId: socket.user._id });
            if (!response) return;

            response.tabSwitchCount += 1;
            response.trustScore = calculateTrustScore(response, 'tab-switch');

            const maxSwitches = quiz.settings.maxTabSwitches || 0;
            const shouldTerminate = !quiz.settings.allowTabSwitch || (maxSwitches > 0 && response.tabSwitchCount > maxSwitches);

            if (shouldTerminate || response.trustScore <= 0) {
                response.status = 'terminated';
                response.terminationReason = shouldTerminate ? 'tab-switch' : 'trust-score-zero';
                response.completedAt = new Date();
            }
            await response.save();

            socket.emit('tab:warning', {
                tabSwitchCount: response.tabSwitchCount,
                maxAllowed: maxSwitches,
                terminated: response.status === 'terminated',
                trustScore: response.trustScore
            });

            if (response.status === 'terminated') {
                io.to(`user:${socket.user._id}`).emit('quiz:terminated', { reason: 'Anti-Cheat Violation' });
                io.to(`quiz:${quizId}:faculty`).emit('participant:tabswitch', {
                    participantId: socket.user._id,
                    participantName: socket.user.name,
                    terminated: true
                });
            } else if (response.trustScore < 50) {
                io.to(`quiz:${quizId}:faculty`).emit('participant:flagged', {
                    participantId: socket.user._id,
                    reason: 'Tab Switching Frequent',
                    score: response.trustScore
                });
            }
        });

        // Updated Answer Submit (Check rapid answer)
        socket.on('answer:submit', async (data) => {
            try {
                const { quizId, questionId, answer, timeTaken } = data;

                // ... (Existing Validation) ...
                const quiz = await Quiz.findById(quizId);
                if (quiz.status !== 'active') return;

                // Trust Score Update
                let trustDeduction = 0;
                if (timeTaken < 800) trustDeduction = 10; // Sub-second answer penalty

                // ... (Existing FindOneAndUpdate Logic) ... 
                // We need to fetch, update trust, then save. Or use pipeline update if possible.
                // For simplicity, sticking to findOne->save or robust update

                const question = quiz.questions.id(questionId);
                if (!question) return;

                const isCorrect = checkAnswer(question, answer);
                const pointsEarned = isCorrect ? question.points : 0;

                const LeaderboardService = require('../services/leaderboardService');

                const response = await Response.findOne({ quizId, userId: socket.user._id });
                if (!response) return;

                // Update answer in array
                const answerIdx = response.answers.findIndex(a => a.questionId.toString() === questionId);
                const answerObj = {
                    questionId,
                    answer,
                    isCorrect,
                    pointsEarned,
                    timeTaken: timeTaken || 0,
                    answeredAt: new Date()
                };

                if (answerIdx > -1) {
                    response.answers[answerIdx] = answerObj;
                } else {
                    response.answers.push(answerObj);
                }

                // Update Trust
                if (trustDeduction > 0) {
                    response.trustScore = Math.max(0, response.trustScore - trustDeduction);
                }

                response.totalScore = response.answers.reduce((acc, curr) => acc + (curr.pointsEarned || 0), 0);
                response.lastActivityAt = new Date();
                response.status = 'in-progress';

                await response.save();

                // 🚀 REDIS: Update Leaderboard Score
                await LeaderboardService.updateScore(quizId, socket.user._id.toString(), response.totalScore);

                // ... (Existing events: answer:feedback, response:received) ...
                socket.emit('answer:feedback', {
                    questionId, isCorrect, pointsEarned, totalScore: response.totalScore
                });

                io.to(`quiz:${quizId}:faculty`).emit('response:received', {
                    participantId: socket.user._id,
                    participantName: socket.user.name,
                    questionId, isCorrect, pointsEarned
                });

                // 🚀 REDIS: Fetch & Emit Leaderboard immediately (High Frequency)
                const redisLeaderboard = await LeaderboardService.getTop(quizId, 10);

                // Hydrate user names (Redis only has IDs) - Simple optimization: 
                // In production, cache user names in Redis hash `users:{id}`.
                // For now, we rely on the client having the list or basic hydration.
                // Or, fetch names from DB for top 10 only (light query).

                const userIds = redisLeaderboard.map(e => e.userId);
                const users = await User.find({ _id: { $in: userIds } }).select('name rollNumber').lean();

                const hydratedLeaderboard = redisLeaderboard.map(entry => {
                    const u = users.find(user => user._id.toString() === entry.userId);
                    return {
                        ...entry,
                        userId: u || { name: 'Unknown', _id: entry.userId }, // Mimic populated structure
                        studentName: u ? u.name : 'Unknown'
                    };
                });

                io.to(`quiz:${quizId}`).emit('leaderboard:update', { leaderboard: hydratedLeaderboard });

                // Background: Update Mongo Ranks periodically, not on every answer?
                // Keeping it for consistency but debounced or omitted for high scale.
                // Response.updateRanks(quizId); // Removed for performance


            } catch (error) {
                console.error('Submit Error:', error);
            }
        });

        // ... Other Events (Next, Leave, End, Kick, Tab) ...

        socket.on('quiz:next-question', async (data) => {
            if (!['faculty', 'admin'].includes(socket.user.role)) return;
            const quiz = await Quiz.findOneAndUpdate(
                { _id: data.quizId },
                { $inc: { currentQuestionIndex: 1 } },
                { new: true }
            );
            if (quiz) {
                io.to(`quiz:${data.quizId}`).emit('quiz:question', {
                    questionIndex: quiz.currentQuestionIndex,
                    isLast: quiz.currentQuestionIndex >= quiz.questions.length - 1,
                    timeLimit: quiz.questions[quiz.currentQuestionIndex]?.timeLimit || quiz.settings.questionTimer
                });
            }
        });

        socket.on('quiz:end', async (data) => {
            if (!['faculty', 'admin'].includes(socket.user.role)) return;
            await forceEndQuiz(data.quizId);
        });

        socket.on('quiz:leave', (data) => {
            socket.leave(`quiz:${data.quizId}`);
            io.to(`quiz:${data.quizId}:faculty`).emit('participant:left', {
                participantId: socket.user._id,
                participantName: socket.user.name
            });
        });

        socket.on('quiz:kick-participant', async (data) => {
            if (!['faculty', 'admin'].includes(socket.user.role)) return;
            const { quizId, participantId } = data;
            const response = await Response.findOneAndUpdate(
                { quizId, userId: participantId },
                { $set: { status: 'terminated', terminationReason: 'manual-kick', completedAt: new Date() } }
            );
            if (response) {
                io.to(`user:${participantId}`).emit('quiz:terminated', { reason: 'Kick by host' });
                io.to(`quiz:${quizId}:faculty`).emit('participant:left', { participantId });
                // Update LB
                await Response.updateRanks(quizId);
            }
        });

        socket.on('tab:switched', async (data) => {
            const { quizId } = data;
            const quiz = await Quiz.findById(quizId);
            if (!quiz) return;

            const response = await Response.findOne({ quizId, userId: socket.user._id });
            if (!response) return;

            response.tabSwitchCount += 1;
            const maxSwitches = quiz.settings.maxTabSwitches || 0;
            const shouldTerminate = !quiz.settings.allowTabSwitch || (maxSwitches > 0 && response.tabSwitchCount > maxSwitches);

            if (shouldTerminate) {
                response.status = 'terminated';
                response.terminationReason = 'tab-switch';
            }
            await response.save();

            socket.emit('tab:warning', {
                tabSwitchCount: response.tabSwitchCount,
                maxAllowed: maxSwitches,
                terminated: shouldTerminate
            });

            if (shouldTerminate) {
                io.to(`user:${socket.user._id}`).emit('quiz:terminated', { reason: 'Tab switch limit exceeded' });
                io.to(`quiz:${quizId}:faculty`).emit('participant:tabswitch', {
                    participantId: socket.user._id,
                    participantName: socket.user.name,
                    terminated: true
                });
            }
        });
    });
};
