const Quiz = require('../models/Quiz');
const Response = require('../models/Response');
const User = require('../models/User');

// @desc    Create a new quiz
// @route   POST /api/quizzes
// @access  Private (Faculty)
exports.createQuiz = async (req, res) => {
    try {
        const { title, description, mode, settings, questions } = req.body;
        console.log('Create Quiz Request Body:', JSON.stringify(req.body, null, 2));

        // Sanitize settings to ensure correct types
        const sanitizedSettings = {
            quizTimer: parseInt(settings?.quizTimer) || 0,
            questionTimer: parseInt(settings?.questionTimer) || 30,
            shuffleQuestions: Boolean(settings?.shuffleQuestions !== false),
            shuffleOptions: Boolean(settings?.shuffleOptions !== false),
            showInstantFeedback: Boolean(settings?.showInstantFeedback !== false),
            showLeaderboard: Boolean(settings?.showLeaderboard !== false),
            allowTabSwitch: Boolean(settings?.allowTabSwitch),
            maxTabSwitches: parseInt(settings?.maxTabSwitches) || 0,
            difficultyLevel: settings?.difficultyLevel || 'medium',
            passingScore: parseInt(settings?.passingScore) || 40,
            maxParticipants: parseInt(settings?.maxParticipants) || 0,
            autoStart: Boolean(settings?.autoStart),
            showCorrectAnswer: Boolean(settings?.showCorrectAnswer !== false)
        };

        if (!req.user || !req.user._id) {
            return res.status(401).json({
                success: false,
                message: 'User authentication failed'
            });
        }

        // Helper to safely parse int
        const safeInt = (val, def) => {
            const parsed = parseInt(val);
            return isNaN(parsed) ? def : parsed;
        };

        // Sanitize questions - remove any string _id and clean up data
        const sanitizedQuestions = (questions || []).map((q, index) => {
            // Create fresh object to avoid unwanted properties
            return {
                text: String(q.text || ''),
                type: ['mcq', 'fill-blank', 'qa'].includes(q.type) ? q.type : 'mcq',
                options: Array.isArray(q.options)
                    ? q.options.filter(opt => opt !== null && opt !== undefined).map(String)
                    : [],
                correctAnswer: String(q.correctAnswer || ''),
                points: safeInt(q.points, 10),
                timeLimit: safeInt(q.timeLimit, 30),
                difficulty: ['easy', 'medium', 'hard', 'advanced'].includes(q.difficulty) ? q.difficulty : 'medium',
                explanation: String(q.explanation || ''),
                order: index
            };
        });

        console.log('Sanitized Questions:', JSON.stringify(sanitizedQuestions, null, 2));

        const quizData = {
            title: String(title || ''),
            description: String(description || ''),
            mode: ['mcq', 'fill-blank', 'qa', 'mixed'].includes(mode) ? mode : 'mcq',
            settings: sanitizedSettings,
            questions: sanitizedQuestions,
            createdBy: req.user._id
        };

        const quiz = await Quiz.create(quizData);

        // Update faculty stats
        await User.findByIdAndUpdate(req.user._id, {
            $inc: { 'stats.quizzesCreated': 1 }
        });

        res.status(201).json({
            success: true,
            message: 'Quiz created successfully',
            data: { quiz }
        });
    } catch (error) {
        console.error('Create quiz error:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            console.error('Validation errors:', messages);
            return res.status(400).json({
                success: false,
                message: messages.join(', '),
                error: messages
            });
        }
        res.status(500).json({
            success: false,
            message: 'Failed to create quiz',
            error: error.message
        });
    }
};

// @desc    Get all quizzes (filtered by role)
// @route   GET /api/quizzes
// @access  Private
exports.getQuizzes = async (req, res) => {
    try {
        const { status, mode, page = 1, limit = 20 } = req.query;

        let query = {};

        // Faculty sees their own quizzes
        if (req.user.role === 'faculty') {
            query.createdBy = req.user._id;
        }

        // Admin sees all quizzes
        // Students see only active quizzes (handled differently via join)

        if (status) query.status = status;
        if (mode) query.mode = mode;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const quizzes = await Quiz.find(query)
            .populate('createdBy', 'name email avatar')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const total = await Quiz.countDocuments(query);

        res.status(200).json({
            success: true,
            data: {
                quizzes,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        console.error('Get quizzes error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch quizzes',
            error: error.message
        });
    }
};

// @desc    Get single quiz by ID
// @route   GET /api/quizzes/:id
// @access  Private
exports.getQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id)
            .populate('createdBy', 'name email avatar')
            .populate('participants', 'name email avatar');

        if (!quiz) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found'
            });
        }

        // Check access rights
        if (req.user.role === 'faculty' && quiz.createdBy._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to access this quiz'
            });
        }

        // For students, hide correct answers if quiz is active
        let quizData = quiz.toObject();
        if (req.user.role === 'student' && quiz.status === 'active') {
            quizData.questions = quizData.questions.map(q => ({
                ...q,
                correctAnswer: undefined,
                explanation: undefined
            }));
        }

        res.status(200).json({
            success: true,
            data: { quiz: quizData }
        });
    } catch (error) {
        console.error('Get quiz error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch quiz',
            error: error.message
        });
    }
};

// @desc    Update quiz
// @route   PUT /api/quizzes/:id
// @access  Private (Faculty owner)
exports.updateQuiz = async (req, res) => {
    try {
        let quiz = await Quiz.findById(req.params.id);

        if (!quiz) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found'
            });
        }

        // Check ownership
        if (quiz.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this quiz'
            });
        }

        const { title, description, mode, settings, questions, status } = req.body;

        const updates = {};
        if (title) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (mode) updates.mode = mode;
        if (settings) updates.settings = { ...quiz.settings, ...settings };
        if (questions) updates.questions = questions;
        if (status) updates.status = status;

        quiz = await Quiz.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true, runValidators: true }
        );

        // Emit socket event for real-time updates if quiz is active
        if (quiz.status === 'active') {
            const io = req.app.get('io');
            if (io) {
                io.to(`quiz:${quiz._id}`).emit('quiz:updated', { quiz });
            }
        }

        res.status(200).json({
            success: true,
            message: 'Quiz updated successfully',
            data: { quiz }
        });
    } catch (error) {
        console.error('Update quiz error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update quiz',
            error: error.message
        });
    }
};

// @desc    Delete quiz
// @route   DELETE /api/quizzes/:id
// @access  Private (Faculty owner or Admin)
exports.deleteQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);

        if (!quiz) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found'
            });
        }

        // Check ownership
        if (quiz.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this quiz'
            });
        }

        // Delete associated responses
        await Response.deleteMany({ quizId: quiz._id });

        await Quiz.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            message: 'Quiz deleted successfully'
        });
    } catch (error) {
        console.error('Delete quiz error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete quiz',
            error: error.message
        });
    }
};

// @desc    Join quiz by code
// @route   POST /api/quizzes/join/:code
// @access  Private (Student)
exports.joinQuiz = async (req, res) => {
    const code = req.params.code?.toUpperCase() || 'UNKNOWN';
    
    try {
        console.log(`\n📍 [JOIN QUIZ] Starting join process for code: ${code}`);
        console.log(`📍 [JOIN QUIZ] User ID: ${req.user._id}, Name: ${req.user.name}`);

        const quiz = await Quiz.findOne({ code })
            .populate('createdBy', 'name email avatar');

        if (!quiz) {
            console.error(`❌ [JOIN QUIZ] Quiz not found for code: ${code}`);
            throw new Error('Quiz not found. Please check the code.');
        }

        console.log(`✅ [JOIN QUIZ] Quiz found: ${quiz.title}`);
        console.log(`✅ [JOIN QUIZ] Quiz status: ${quiz.status}`);
        console.log(`✅ [JOIN QUIZ] Current participants: ${quiz.participants?.length || 0}`);

        if (quiz.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Quiz has already ended'
            });
        }

        // Check max participants
        if (quiz.settings.maxParticipants > 0 && quiz.participants.length >= quiz.settings.maxParticipants) {
            const alreadyJoined = quiz.participants.some(p => p.toString() === req.user._id.toString());
            if (!alreadyJoined) {
                return res.status(400).json({
                    success: false,
                    message: 'Quiz has reached maximum participants'
                });
            }
        }

        // Check if already joined
        const userId = req.user._id.toString();
        const alreadyJoined = quiz.participants.some(p => p.toString() === userId);

        // Check for existing response
        let response = await Response.findOne({ quizId: quiz._id, userId: req.user._id });

        if (!alreadyJoined) {
            console.log(`✅ [JOIN QUIZ] Adding ${req.user.name} to participants`);
            // Add to participants
            await Quiz.findByIdAndUpdate(quiz._id, {
                $addToSet: { participants: req.user._id }
            });
            // Update local quiz object for response count
            if (quiz.participants) {
                quiz.participants.push(req.user._id);
            }
        } else {
            console.log(`ℹ️  [JOIN QUIZ] ${req.user.name} already in participants`);
        }

        if (!response) {
            console.log(`📝 [JOIN QUIZ] Creating Response document for ${req.user.name}`);
            const questions = quiz.questions || [];
            const shuffledQuestions = questions.length > 0
                ? quiz.getShuffledQuestions(userId)
                : [];

            try {
                response = await Response.create({
                    quizId: quiz._id,
                    userId: req.user._id,
                    status: 'waiting',
                    maxPossibleScore: questions.reduce((sum, q) => sum + (q.points || 0), 0),
                    questionOrder: shuffledQuestions.map(q => q._id),
                    answers: shuffledQuestions.map((q, idx) => ({
                        questionId: q._id,
                        questionIndex: idx
                    }))
                });

                console.log(`✅ [JOIN QUIZ] Response created with ID: ${response._id}`);

                // Update student stats
                await User.findByIdAndUpdate(req.user._id, {
                    $inc: { 'stats.quizzesAttended': 1 }
                });
            } catch (err) {
                if (err.code === 11000) {
                    // Duplicate key error, another request probably created it
                    console.log(`ℹ️  [JOIN QUIZ] Duplicate key (race condition), fetching existing Response`);
                    response = await Response.findOne({ quizId: quiz._id, userId: req.user._id });
                } else {
                    console.error('❌ [JOIN QUIZ] Error creating Response:', err);
                    throw err;
                }
            }
        } else {
            console.log(`ℹ️  [JOIN QUIZ] Response already exists for ${req.user.name}`);
        }

        if (!response) {
            throw new Error('Failed to create or find quiz response');
        }

        console.log(`✅ [JOIN QUIZ] Response verified, ID: ${response._id}`);

        // Prepare quiz data for student (hide answers)
        const quizData = quiz.toObject();
        quizData.questions = (quizData.questions || []).map(q => ({
            _id: q._id,
            text: q.text,
            type: q.type,
            options: quiz.settings?.shuffleOptions ? shuffleArray([...(q.options || [])]) : (q.options || []),
            points: q.points,
            timeLimit: q.timeLimit,
            difficulty: q.difficulty
        }));

        // Emit socket event for participant joined
        const io = req.app.get('io');
        if (io) {
            console.log(`📡 [JOIN QUIZ] Emitting participant:joined event`);
            io.to(`quiz:${quiz._id}`).emit('participant:joined', {
                participant: {
                    id: req.user._id,
                    name: req.user.name,
                    avatar: req.user.avatar
                },
                participantCount: quiz.participants?.length || 0
            });
        } else {
            console.warn(`⚠️  [JOIN QUIZ] Socket.io instance not found!`);
        }

        console.log(`✅ [JOIN QUIZ] Join process completed successfully for ${req.user.name}\n`);

        res.status(200).json({
            success: true,
            message: 'Joined successfully',
            data: {
                quiz: quizData,
                response: {
                    _id: response._id,
                    status: response.status,
                    currentQuestionIndex: response.currentQuestionIndex || 0
                }
            }
        });
    } catch (error) {
        console.error('❌ Join quiz error FULL STACK:', error.stack);
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        console.error('Code accessed:', code);
        
        // More specific error messages
        let statusCode = 500;
        let errorMessage = 'Failed to join quiz';
        
        if (error.message.includes('Quiz not found')) {
            statusCode = 404;
            errorMessage = 'Quiz code not found. Please check the code.';
        } else if (error.message.includes('response')) {
            statusCode = 400;
            errorMessage = 'Failed to create quiz response. ' + error.message;
        } else if (error.code === 11000) {
            statusCode = 400;
            errorMessage = 'You have already joined this quiz';
        }
        
        res.status(statusCode).json({
            success: false,
            message: errorMessage,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// @desc    Start quiz
// @route   POST /api/quizzes/:id/start
// @access  Private (Faculty owner)
exports.startQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);

        if (!quiz) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found'
            });
        }

        // Check ownership (owner or admin)
        if (quiz.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            console.log(`Unauthorized start attempt. Quiz Creator: ${quiz.createdBy}, Attempted by: ${req.user._id} (${req.user.role})`);
            return res.status(403).json({
                success: false,
                message: 'Not authorized to start this quiz. Only the creator can start it.'
            });
        }

        if (quiz.questions.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot start quiz without questions'
            });
        }

        quiz.status = 'active';
        quiz.startedAt = new Date();
        quiz.currentQuestionIndex = 0;
        await quiz.save();

        // Update all waiting responses to in-progress
        await Response.updateMany(
            { quizId: quiz._id, status: 'waiting' },
            { $set: { status: 'in-progress', startedAt: new Date() } }
        );

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`quiz:${quiz._id}`).emit('quiz:started', {
                quizId: quiz._id,
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
        }

        res.status(200).json({
            success: true,
            message: 'Quiz started successfully',
            data: { quiz }
        });
    } catch (error) {
        console.error('Start quiz error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start quiz',
            error: error.message
        });
    }
};

// @desc    End quiz
// @route   POST /api/quizzes/:id/end
// @access  Private (Faculty owner)
exports.endQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);

        if (!quiz) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found'
            });
        }

        // Check ownership (owner or admin)
        if (quiz.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to end this quiz'
            });
        }

        quiz.status = 'completed';
        quiz.endedAt = new Date();
        await quiz.save();

        // Complete all in-progress responses
        await Response.updateMany(
            { quizId: quiz._id, status: 'in-progress' },
            { $set: { status: 'completed', completedAt: new Date() } }
        );

        // Update ranks
        await Response.updateRanks(quiz._id);

        // Get final leaderboard
        const leaderboard = await Response.getLeaderboard(quiz._id);

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`quiz:${quiz._id}`).emit('quiz:ended', {
                quizId: quiz._id,
                endedAt: quiz.endedAt,
                leaderboard
            });
        }

        res.status(200).json({
            success: true,
            message: 'Quiz ended successfully',
            data: { quiz, leaderboard }
        });
    } catch (error) {
        console.error('End quiz error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to end quiz',
            error: error.message
        });
    }
};

// @desc    Get quiz leaderboard
// @route   GET /api/quizzes/:id/leaderboard
// @access  Private
exports.getLeaderboard = async (req, res) => {
    try {
        const leaderboard = await Response.getLeaderboard(req.params.id);

        res.status(200).json({
            success: true,
            data: { leaderboard }
        });
    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch leaderboard',
            error: error.message
        });
    }
};

// @desc    Get quiz results (for download)
// @route   GET /api/quizzes/:id/results
// @access  Private (Faculty owner or Admin)
exports.getQuizResults = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id)
            .populate('createdBy', 'name email');

        if (!quiz) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found'
            });
        }

        // Check ownership
        if (quiz.createdBy._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view results'
            });
        }

        const responses = await Response.find({ quizId: quiz._id })
            .populate('userId', 'name email avatar')
            .sort({ rank: 1, totalScore: -1, totalTimeTaken: 1 })
            .lean();

        // Calculate quiz analytics
        const completedResponses = responses.filter(r => r.status === 'completed');
        const totalParticipants = responses.length;
        const completedCount = completedResponses.length;
        const avgScore = completedCount > 0
            ? Math.round(completedResponses.reduce((sum, r) => sum + r.percentage, 0) / completedCount)
            : 0;
        const avgTime = completedCount > 0
            ? Math.round(completedResponses.reduce((sum, r) => sum + r.totalTimeTaken, 0) / completedCount)
            : 0;
        const passedCount = completedResponses.filter(r => r.percentage >= (quiz.settings.passingScore || 40)).length;
        const tabSwitchers = responses.filter(r => r.tabSwitchCount > 0);

        // Question-wise analytics
        const questionAnalytics = quiz.questions.map((q, index) => {
            const correctCount = responses.filter(r => {
                const answer = r.answers?.find(a => a.questionId?.toString() === q._id.toString());
                return answer?.isCorrect;
            }).length;

            return {
                questionId: q._id,
                questionNumber: index + 1,
                questionText: q.text,
                type: q.type,
                correctAnswer: q.correctAnswer,
                options: q.options,
                points: q.points,
                difficulty: q.difficulty,
                totalAttempts: responses.filter(r => {
                    const answer = r.answers?.find(a => a.questionId?.toString() === q._id.toString());
                    return answer?.answer;
                }).length,
                correctAttempts: correctCount,
                accuracy: totalParticipants > 0 ? Math.round((correctCount / totalParticipants) * 100) : 0
            };
        });

        // Detailed student responses with answers
        const detailedResponses = responses.map(r => ({
            rank: r.rank,
            student: {
                id: r.userId._id,
                name: r.userId.name,
                email: r.userId.email,
                avatar: r.userId.avatar
            },
            totalScore: r.totalScore,
            maxPossibleScore: r.maxPossibleScore,
            percentage: r.percentage,
            correctCount: r.correctCount,
            wrongCount: r.wrongCount,
            unansweredCount: r.unansweredCount,
            totalTimeTaken: r.totalTimeTaken,
            averageTimePerQuestion: r.averageTimePerQuestion,
            status: r.status,
            terminationReason: r.terminationReason,
            tabSwitchCount: r.tabSwitchCount,
            startedAt: r.startedAt,
            completedAt: r.completedAt,
            passed: r.percentage >= (quiz.settings.passingScore || 40),
            answers: r.answers?.map(a => {
                const question = quiz.questions.find(q => q._id.toString() === a.questionId?.toString());
                return {
                    questionId: a.questionId,
                    questionText: question?.text || '',
                    questionType: question?.type || 'mcq',
                    studentAnswer: a.answer,
                    correctAnswer: question?.correctAnswer || '',
                    options: question?.options || [],
                    isCorrect: a.isCorrect,
                    pointsEarned: a.pointsEarned,
                    maxPoints: question?.points || 0,
                    timeTaken: a.timeTaken,
                    answeredAt: a.answeredAt
                };
            }) || []
        }));

        res.status(200).json({
            success: true,
            data: {
                quiz: {
                    id: quiz._id,
                    title: quiz.title,
                    description: quiz.description,
                    code: quiz.code,
                    status: quiz.status,
                    mode: quiz.mode,
                    createdBy: quiz.createdBy.name,
                    createdAt: quiz.createdAt,
                    startedAt: quiz.startedAt,
                    endedAt: quiz.endedAt,
                    totalQuestions: quiz.questions.length,
                    totalPoints: quiz.questions.reduce((sum, q) => sum + q.points, 0),
                    passingScore: quiz.settings.passingScore || 40,
                    settings: quiz.settings
                },
                analytics: {
                    totalParticipants,
                    completedCount,
                    inProgressCount: responses.filter(r => r.status === 'in-progress').length,
                    waitingCount: responses.filter(r => r.status === 'waiting').length,
                    terminatedCount: responses.filter(r => r.status === 'terminated').length,
                    avgScore,
                    avgTime,
                    highestScore: completedResponses.length > 0 ? Math.max(...completedResponses.map(r => r.percentage)) : 0,
                    lowestScore: completedResponses.length > 0 ? Math.min(...completedResponses.map(r => r.percentage)) : 0,
                    passedCount,
                    failedCount: completedCount - passedCount,
                    passRate: completedCount > 0 ? Math.round((passedCount / completedCount) * 100) : 0,
                    tabSwitchersCount: tabSwitchers.length,
                    tabSwitchers: tabSwitchers.map(r => ({
                        name: r.userId.name,
                        email: r.userId.email,
                        count: r.tabSwitchCount,
                        terminated: r.terminationReason === 'tab-switch'
                    }))
                },
                questionAnalytics,
                leaderboard: detailedResponses.slice(0, 10),
                responses: detailedResponses
            }
        });
    } catch (error) {
        console.error('Get quiz results error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch results',
            error: error.message
        });
    }
};

// Helper function to shuffle array
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
