const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Quiz = require('../models/Quiz');
const Response = require('../models/Response');

module.exports = (io) => {
    // Authentication middleware for socket connections
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;

            if (!token) {
                return next(new Error('Authentication required'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id);

            if (!user || !user.isActive) {
                return next(new Error('User not found or inactive'));
            }

            socket.user = user;
            next();
        } catch (error) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`🔌 User connected: ${socket.user.name} (${socket.user.role})`);

        // Join user to their personal room
        socket.join(`user:${socket.user._id}`);

        // Join quiz room
        socket.on('quiz:join', async (data) => {
            try {
                const { quizId } = data;

                const quiz = await Quiz.findById(quizId);
                if (!quiz) {
                    socket.emit('error', { message: 'Quiz not found' });
                    return;
                }

                // Join main quiz room
                socket.join(`quiz:${quizId}`);

                // Faculty joins faculty-only room
                if (socket.user.role === 'faculty' || socket.user.role === 'admin') {
                    socket.join(`quiz:${quizId}:faculty`);
                }

                console.log(`👤 ${socket.user.name} joined quiz: ${quiz.title}`);

                // Notify others in the room
                socket.to(`quiz:${quizId}`).emit('participant:joined', {
                    participant: {
                        id: socket.user._id,
                        name: socket.user.name,
                        avatar: socket.user.avatar,
                        role: socket.user.role
                    }
                });

                // Get current participants
                const response = await Response.find({ quizId, status: { $in: ['waiting', 'in-progress'] } })
                    .populate('userId', 'name avatar');

                socket.emit('quiz:joined', {
                    quizId,
                    participants: response.map(r => ({
                        _id: r.userId._id,
                        id: r.userId._id,
                        name: r.userId.name,
                        avatar: r.userId.avatar,
                        status: r.status
                    }))
                });

            } catch (error) {
                console.error('Quiz join error:', error);
                socket.emit('error', { message: 'Failed to join quiz' });
            }
        });

        // Leave quiz room
        socket.on('quiz:leave', async (data) => {
            try {
                const { quizId } = data;

                socket.leave(`quiz:${quizId}`);
                socket.leave(`quiz:${quizId}:faculty`);

                socket.to(`quiz:${quizId}`).emit('participant:left', {
                    participantId: socket.user._id,
                    participantName: socket.user.name
                });

                console.log(`👤 ${socket.user.name} left quiz: ${quizId}`);
            } catch (error) {
                console.error('Quiz leave error:', error);
            }
        });

        // Faculty starts quiz
        socket.on('quiz:start', async (data) => {
            try {
                if (socket.user.role !== 'faculty' && socket.user.role !== 'admin') {
                    socket.emit('error', { message: 'Not authorized' });
                    return;
                }

                const { quizId } = data;

                const quiz = await Quiz.findById(quizId);
                if (!quiz) {
                    socket.emit('error', { message: 'Quiz not found' });
                    return;
                }
                const isAuthorized = quiz.createdBy.toString() === socket.user._id.toString() || socket.user.role === 'admin';
                if (!isAuthorized) {
                    console.log(`Socket Unauthorized start attempt. Creator: ${quiz.createdBy}, User: ${socket.user._id}`);
                    socket.emit('error', { message: 'Not authorized: Only the creator can start the quiz' });
                    return;
                }

                quiz.status = 'active';
                quiz.startedAt = new Date();
                quiz.currentQuestionIndex = 0;
                await quiz.save();

                // Update all waiting responses
                await Response.updateMany(
                    { quizId, status: 'waiting' },
                    { $set: { status: 'in-progress', startedAt: new Date() } }
                );

                // Broadcast to all participants
                io.to(`quiz:${quizId}`).emit('quiz:started', {
                    quizId,
                    startedAt: quiz.startedAt,
                    currentQuestionIndex: 0,
                    totalQuestions: quiz.questions.length,
                    questions: quiz.questions,
                    questionTimer: quiz.settings.questionTimer,
                    settings: {
                        questionTimer: quiz.settings.questionTimer,
                        showInstantFeedback: quiz.settings.showInstantFeedback,
                        allowTabSwitch: quiz.settings.allowTabSwitch
                    }
                });

                console.log(`🎮 Quiz started: ${quiz.title}`);
            } catch (error) {
                console.error('Quiz start error:', error);
                socket.emit('error', { message: 'Failed to start quiz' });
            }
        });

        // Faculty advances to next question
        socket.on('quiz:next-question', async (data) => {
            try {
                if (socket.user.role !== 'faculty' && socket.user.role !== 'admin') {
                    socket.emit('error', { message: 'Not authorized' });
                    return;
                }

                const { quizId } = data;

                const quiz = await Quiz.findById(quizId);
                if (!quiz) {
                    socket.emit('error', { message: 'Quiz not found' });
                    return;
                }

                quiz.currentQuestionIndex += 1;
                await quiz.save();

                io.to(`quiz:${quizId}`).emit('quiz:question', {
                    questionIndex: quiz.currentQuestionIndex,
                    isLast: quiz.currentQuestionIndex >= quiz.questions.length - 1,
                    timeLimit: quiz.questions[quiz.currentQuestionIndex]?.timeLimit || quiz.settings.questionTimer
                });
            } catch (error) {
                console.error('Next question error:', error);
                socket.emit('error', { message: 'Failed to advance question' });
            }
        });

        // Student submits answer via socket (for real-time)
        socket.on('answer:submit', async (data) => {
            try {
                const { quizId, questionId, answer, timeTaken } = data;

                const quiz = await Quiz.findById(quizId);
                if (!quiz || quiz.status !== 'active') {
                    socket.emit('error', { message: 'Quiz not active' });
                    return;
                }

                const response = await Response.findOne({ quizId, userId: socket.user._id });
                if (!response) {
                    socket.emit('error', { message: 'Not a participant' });
                    return;
                }

                const question = quiz.questions.id(questionId);
                if (!question) {
                    socket.emit('error', { message: 'Question not found' });
                    return;
                }

                // Check answer
                const isCorrect = checkAnswer(question, answer);
                const pointsEarned = isCorrect ? question.points : 0;

                // Update answer
                const answerIndex = response.answers.findIndex(
                    a => a.questionId.toString() === questionId.toString()
                );

                if (answerIndex !== -1) {
                    response.answers[answerIndex] = {
                        ...response.answers[answerIndex].toObject(),
                        answer,
                        isCorrect,
                        pointsEarned,
                        timeTaken: timeTaken || 0,
                        answeredAt: new Date()
                    };
                    await response.save();
                }

                // Send feedback to student
                socket.emit('answer:feedback', {
                    questionId,
                    isCorrect,
                    pointsEarned,
                    totalScore: response.totalScore,
                    currentScore: response.totalScore,
                    correctAnswer: quiz.settings.showCorrectAnswer ? question.correctAnswer : undefined
                });

                // Notify faculty
                io.to(`quiz:${quizId}:faculty`).emit('response:received', {
                    participantId: socket.user._id,
                    participantName: socket.user.name,
                    questionId,
                    isCorrect,
                    pointsEarned,
                    timeTaken,
                    currentScore: response.totalScore
                });

                // Update leaderboard
                const leaderboard = await Response.getLeaderboard(quizId, 10);
                io.to(`quiz:${quizId}`).emit('leaderboard:update', { leaderboard });

            } catch (error) {
                console.error('Answer submit error:', error);
                socket.emit('error', { message: 'Failed to submit answer' });
            }
        });

        // Tab switch detected
        socket.on('tab:switched', async (data) => {
            try {
                const { quizId } = data;

                const quiz = await Quiz.findById(quizId);
                if (!quiz) return;

                const response = await Response.findOne({ quizId, userId: socket.user._id });
                if (!response) return;

                response.tabSwitchCount += 1;

                const maxSwitches = quiz.settings.maxTabSwitches || 0;
                const shouldTerminate = !quiz.settings.allowTabSwitch ||
                    (maxSwitches > 0 && response.tabSwitchCount > maxSwitches);

                if (shouldTerminate) {
                    response.status = 'terminated';
                    response.terminationReason = 'tab-switch';
                    response.completedAt = new Date();
                }

                await response.save();

                // Notify student
                socket.emit('tab:warning', {
                    tabSwitchCount: response.tabSwitchCount,
                    maxAllowed: maxSwitches,
                    terminated: shouldTerminate
                });

                // Notify faculty
                io.to(`quiz:${quizId}:faculty`).emit('participant:tabswitch', {
                    participantId: socket.user._id,
                    participantName: socket.user.name,
                    tabSwitchCount: response.tabSwitchCount,
                    terminated: shouldTerminate
                });

                if (shouldTerminate) {
                    // Update leaderboard without terminated student
                    await Response.updateRanks(quizId);
                    const leaderboard = await Response.getLeaderboard(quizId);
                    io.to(`quiz:${quizId}`).emit('leaderboard:update', { leaderboard });
                }

            } catch (error) {
                console.error('Tab switch error:', error);
            }
        });

        // Student completes quiz
        socket.on('quiz:complete', async (data) => {
            try {
                const { quizId } = data;

                const response = await Response.findOne({ quizId, userId: socket.user._id });
                if (!response) return;

                response.status = 'completed';
                response.completedAt = new Date();
                await response.save();

                // Update ranks
                await Response.updateRanks(quizId);

                // Get final stats
                const updatedResponse = await Response.findById(response._id);

                socket.emit('quiz:completed', {
                    totalScore: updatedResponse.totalScore,
                    percentage: updatedResponse.percentage,
                    rank: updatedResponse.rank,
                    correctCount: updatedResponse.correctCount,
                    wrongCount: updatedResponse.wrongCount,
                    totalTimeTaken: updatedResponse.totalTimeTaken
                });

                // Notify faculty
                io.to(`quiz:${quizId}:faculty`).emit('participant:completed', {
                    participantId: socket.user._id,
                    participantName: socket.user.name,
                    score: updatedResponse.totalScore,
                    rank: updatedResponse.rank
                });

                // Update leaderboard
                const leaderboard = await Response.getLeaderboard(quizId);
                io.to(`quiz:${quizId}`).emit('leaderboard:update', { leaderboard });

            } catch (error) {
                console.error('Quiz complete error:', error);
                socket.emit('error', { message: 'Failed to complete quiz' });
            }
        });

        // Faculty ends quiz
        socket.on('quiz:end', async (data) => {
            try {
                if (socket.user.role !== 'faculty' && socket.user.role !== 'admin') {
                    socket.emit('error', { message: 'Not authorized' });
                    return;
                }

                const { quizId } = data;

                const quiz = await Quiz.findById(quizId);
                if (!quiz) return;

                quiz.status = 'completed';
                quiz.endedAt = new Date();
                await quiz.save();

                // Complete all in-progress responses
                await Response.updateMany(
                    { quizId, status: 'in-progress' },
                    { $set: { status: 'completed', completedAt: new Date() } }
                );

                // Update final ranks
                await Response.updateRanks(quizId);

                // Get final leaderboard
                const leaderboard = await Response.getLeaderboard(quizId);

                // Broadcast to all
                io.to(`quiz:${quizId}`).emit('quiz:ended', {
                    quizId,
                    endedAt: quiz.endedAt,
                    leaderboard
                });

                console.log(`🏁 Quiz ended: ${quiz.title}`);
            } catch (error) {
                console.error('Quiz end error:', error);
                socket.emit('error', { message: 'Failed to end quiz' });
            }
        });

        // Disconnect
        socket.on('disconnect', () => {
            console.log(`🔌 User disconnected: ${socket.user.name}`);
        });
    });
};

// Helper function
function checkAnswer(question, answer) {
    if (!answer) return false;

    const normalize = (str) => str.toString().toLowerCase().trim();

    switch (question.type) {
        case 'mcq':
            return normalize(answer) === normalize(question.correctAnswer);
        case 'fill-blank':
            const correctAnswers = question.correctAnswer.split('|').map(a => normalize(a));
            return correctAnswers.includes(normalize(answer));
        case 'qa':
            const userAnswer = normalize(answer);
            const expected = normalize(question.correctAnswer);
            const expectedWords = expected.split(/\s+/).filter(w => w.length > 3);
            const matchedWords = expectedWords.filter(w => userAnswer.includes(w));
            return matchedWords.length >= expectedWords.length * 0.6;
        default:
            return false;
    }
}
