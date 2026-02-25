const Quiz = require('../models/Quiz');
const Response = require('../models/Response');
const User = require('../models/User');
const excel = require('exceljs');

// @desc    Create a new quiz
// @route   POST /api/quizzes
// @access  Private (Faculty)
exports.createQuiz = async (req, res) => {
    try {
        let { title, subject, description, mode, settings, questions, scheduledAt, accessControl } = req.body;

        // If data is sent as form-data (e.g., when uploading an image), 
        // stringified JSON fields need to be parsed
        try {
            if (typeof settings === 'string') settings = JSON.parse(settings);
            if (typeof questions === 'string') questions = JSON.parse(questions);
            if (typeof accessControl === 'string') accessControl = JSON.parse(accessControl);
        } catch (e) {
            console.error('Error parsing multipart form data:', e);
        }

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
                type: ['mcq', 'msq', 'fill-blank', 'qa'].includes(q.type) ? q.type : 'mcq',
                options: Array.isArray(q.options)
                    ? q.options.filter(opt => opt !== null && opt !== undefined).map(String)
                    : [],
                correctAnswer: String(q.correctAnswer || ''),
                points: safeInt(q.points, 10),
                timeLimit: safeInt(q.timeLimit, 0),
                difficulty: ['easy', 'medium', 'hard', 'advanced'].includes(q.difficulty) ? q.difficulty : 'medium',
                explanation: String(q.explanation || ''),
                order: index
            };
        });

        console.log('Sanitized Questions:', JSON.stringify(sanitizedQuestions, null, 2));

        // Sanitize accessControl
        const sanitizedAccessControl = {
            isPublic: accessControl?.isPublic !== false, // default true
            allowedBranches: Array.isArray(accessControl?.allowedBranches)
                ? accessControl.allowedBranches.map(b => ({
                    name: String(b.name || ''),
                    sections: Array.isArray(b.sections) ? b.sections.map(String) : []
                }))
                : [],
            mode: accessControl?.mode === 'SPECIFIC' ? 'SPECIFIC' : 'ALL',
            allowedStudents: Array.isArray(accessControl?.allowedStudents)
                ? accessControl.allowedStudents
                : []
        };

        const quizData = {
            title: String(title || ''),
            subject: String(subject || 'General'),
            description: String(description || ''),
            coverImage: req.file ? req.file.path : '',
            mode: ['mcq', 'msq', 'fill-blank', 'qa', 'mixed'].includes(mode) ? mode : 'mcq',
            settings: sanitizedSettings,
            questions: sanitizedQuestions,
            accessControl: sanitizedAccessControl,
            createdBy: req.user._id,
            scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
            status: scheduledAt ? 'scheduled' : 'draft'
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
        // Students see active quizzes AND scheduled quizzes that apply to them
        if (req.user.role === 'student') {
            // STRICT ACCESS CONTROL for Students
            // 1. Must be active or scheduled
            // 2. Must match Department AND Section OR be in allowedStudents list
            // 3. 'isPublic' means open to ALL students of the college, unless branches are specified (which would be a contradiction in UI, but handled here).
            //    If isPublic is true, it shows for everyone.
            //    If isPublic is false, we check branches/students.

            query.$and = [
                { status: status || { $in: ['active', 'scheduled'] } },
                {
                    $or: [
                        { 'accessControl.isPublic': true },
                        {
                            'accessControl.allowedBranches': {
                                $elemMatch: {
                                    name: req.user.department,
                                    // Match student's section OR empty string (meaning all sections)
                                    sections: { $in: [req.user.section, ''] }
                                }
                            }
                        },
                        {
                            'accessControl.allowedStudents': req.user._id
                        }
                    ]
                }
            ];

            // Explicitly exclude drafts/completed unless asked (already handled by status filter above)
        } else {
            // Faculty / admin — apply simple status/mode filters
            if (status) query.status = status;
            if (mode) query.mode = mode;
        }

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
            .populate('participants', 'name email avatar rollNumber section department');

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

        if (req.user.role === 'student') {
            // Check expiry first
            if (quiz.status === 'active' && quiz.expiresAt && new Date(quiz.expiresAt) < new Date()) {
                // Auto-close if expired (lazy check)
                quiz.status = 'completed';
                await quiz.save();
                quizData.status = 'completed';
            }

            if (quizData.status === 'active') {
                quizData.questions = quizData.questions.map(q => ({
                    ...q,
                    correctAnswer: undefined,
                    explanation: undefined
                }));
            }
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

        let { title, description, mode, settings, questions, status } = req.body;

        // Handle multipart form data parsing
        try {
            if (typeof settings === 'string') settings = JSON.parse(settings);
            if (typeof questions === 'string') questions = JSON.parse(questions);
        } catch (e) {
            console.error('Error parsing multipart form data in update:', e);
        }

        const updates = {};
        if (title) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (req.file) updates.coverImage = req.file.path;
        if (mode) updates.mode = mode;
        if (settings) updates.settings = { ...quiz.settings, ...settings };
        if (questions) updates.questions = questions;
        if (status) updates.status = status;
        if (req.body.accessControl !== undefined) {
            let ac = req.body.accessControl;
            if (typeof ac === 'string') {
                try { ac = JSON.parse(ac); } catch (e) { }
            }
            updates.accessControl = {
                isPublic: ac?.isPublic !== false,
                allowedBranches: Array.isArray(ac?.allowedBranches)
                    ? ac.allowedBranches.map(b => ({
                        name: String(b.name || ''),
                        sections: Array.isArray(b.sections) ? b.sections.map(String) : []
                    }))
                    : [],
                mode: ac?.mode === 'SPECIFIC' ? 'SPECIFIC' : 'ALL',
                allowedStudents: Array.isArray(ac?.allowedStudents)
                    ? ac.allowedStudents
                    : []
            };
        }
        if (req.body.scheduledAt !== undefined) {
            updates.scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;
            if (updates.scheduledAt && quiz.status === 'draft') {
                updates.status = 'scheduled';
            }
        }

        quiz = await Quiz.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true, runValidators: true }
        );

        // Emit socket event for real-time updates if quiz is active
        if (quiz.status === 'active' || quiz.status === 'live') {
            const io = req.app.get('io');
            if (io) {
                io.to(String(quiz._id)).emit('quiz:updated', { quiz });
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
        console.log(`📍 [JOIN QUIZ] User ID: ${req.user._id}, Name: ${req.user.name}, Role: ${req.user.role}`);

        // Faculty and admin should not join as participants
        if (['faculty', 'admin'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Faculty and admin cannot join quizzes as participants. Use the Host view instead.'
            });
        }

        const quiz = await Quiz.findOne({ code })
            .populate('createdBy', 'name email avatar');

        if (!quiz) {
            console.error(`❌ [JOIN QUIZ] Quiz not found for code: ${code}`);
            throw new Error('Quiz not found. Please check the code.');
        }

        console.log(`✅ [JOIN QUIZ] Quiz found: ${quiz.title}`);
        console.log(`✅ [JOIN QUIZ] Quiz status: ${quiz.status}`);
        console.log(`✅ [JOIN QUIZ] Current participants: ${quiz.participants?.length || 0}`);

        // Check if expired
        if (quiz.status === 'active' && quiz.expiresAt && new Date(quiz.expiresAt) < new Date()) {
            quiz.status = 'completed';
            await quiz.save();
            return res.status(400).json({
                success: false,
                message: 'Quiz has time-expired'
            });
        }

        if (quiz.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Quiz has already ended'
            });
        }

        // Access Control Check
        if (req.user.role === 'student') {
            const { isPublic, allowedBranches, mode, allowedStudents } = quiz.accessControl || {};

            if (!isPublic) {
                // If specific mode, user MUST be in allowedStudents list
                if (mode === 'SPECIFIC') {
                    const isAllowed = allowedStudents?.some(id => id.toString() === req.user._id.toString());
                    if (!isAllowed) {
                        return res.status(403).json({
                            success: false,
                            message: 'This quiz is restricted to specific students only.'
                        });
                    }
                } else {
                    // Check Branch & Section
                    const userBranch = req.user.department; // assuming department stores branch name like 'CSE'
                    const userSection = req.user.section;

                    const branchConfig = allowedBranches?.find(b => b.name === userBranch);

                    if (!branchConfig) {
                        return res.status(403).json({
                            success: false,
                            message: `This quiz is not available for ${userBranch} department.`
                        });
                    }

                    // If sections are specified, check section
                    if (branchConfig.sections && branchConfig.sections.length > 0) {
                        if (!branchConfig.sections.includes(userSection)) {
                            return res.status(403).json({
                                success: false,
                                message: `This quiz is not available for Section ${userSection}.`
                            });
                        }
                    }
                }
            }
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
                // If quiz is already live/active, set status to 'in-progress' directly
                const isQuizLive = ['live', 'active', 'question_active', 'started'].includes(quiz.status);
                response = await Response.create({
                    quizId: quiz._id,
                    userId: req.user._id,
                    status: isQuizLive ? 'in-progress' : 'waiting',
                    startedAt: isQuizLive ? new Date() : null,
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
            io.to(String(quiz._id)).emit('participant:joined', {
                participant: {
                    id: req.user._id,
                    name: req.user.name,
                    avatar: req.user.avatar,
                    rollNumber: req.user.rollNumber,
                    section: req.user.section,
                    department: req.user.department
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
        console.log(`[START QUIZ] User: ${req.user._id} (${req.user.name}, role=${req.user.role}), Quiz creator: ${quiz.createdBy}`);
        if (quiz.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            console.warn(`[START QUIZ] ❌ 403: User ${req.user._id} (role=${req.user.role}) tried to start quiz owned by ${quiz.createdBy}`);
            return res.status(403).json({
                success: false,
                message: 'Not authorized to start this quiz'
            });
        }

        if (quiz.questions.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot start quiz without questions'
            });
        }

        quiz.status = 'live';
        quiz.startedAt = new Date();
        quiz.currentQuestionIndex = 0;

        // Set expiration time if quiz timer is set
        // Adding a 5 second buffer for network latency
        if (quiz.settings?.questionTimer > 0) {
            quiz.expiresAt = new Date(quiz.startedAt.getTime() + (quiz.settings.questionTimer * 1000));
            console.log(`[START QUIZ] Timer set. Expires at: ${quiz.expiresAt}`);
        } else {
            quiz.expiresAt = null;
        }

        await quiz.save();

        // Update all waiting responses to in-progress
        await Response.updateMany(
            { quizId: quiz._id, status: 'waiting' },
            { $set: { status: 'in-progress', startedAt: new Date() } }
        );

        // Emit socket event with standardized name
        const io = req.app.get('io');
        if (io) {
            const roomName = `quiz_${quiz._id}`;
            io.to(roomName).emit('quizStatusUpdate', 'live');
            io.to(roomName).emit('quiz:state_changed', {
                status: 'live',
                currentQuestionIndex: 0,
                expiresAt: quiz.expiresAt
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

        console.log(`[END QUIZ] Manually ending quiz: ${quiz._id}`);

        quiz.status = 'done';
        quiz.endedAt = new Date();
        quiz.expiresAt = null;
        await quiz.save();

        // Mark all active responses as completed
        const activeResponses = await Response.find({
            quizId: quiz._id,
            status: 'in-progress'
        });

        await Promise.all(activeResponses.map(async (response) => {
            response.status = 'completed';
            response.completedAt = new Date();
            return response.save();
        }));

        await Response.updateRanks(quiz._id);
        const leaderboard = await Response.getLeaderboard(quiz._id, 10);

        const io = req.app.get('io');
        if (io) {
            const roomName = `quiz_${quiz._id}`;
            io.to(roomName).emit('quizStatusUpdate', 'done');
            io.to(roomName).emit('quiz:ended', { leaderboard });
            io.to(roomName).emit('quiz:state_changed', { status: 'done', leaderboard });
        }

        res.status(200).json({
            success: true,
            data: { quiz, leaderboard }
        });
    } catch (error) {
        console.error('End quiz error:', error);
        res.status(500).json({ success: false, message: 'Failed to end quiz' });
    }
};

// @desc    Get quiz leaderboard
// @route   GET /api/quizzes/:id/leaderboard
// @access  Private
exports.getLeaderboard = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) {
            return res.status(404).json({ success: false, message: 'Quiz not found' });
        }

        // Check settings and role
        if (req.user.role === 'student' && quiz.settings?.showLeaderboard === false) {
            return res.status(403).json({
                success: false,
                message: 'Leaderboard is hidden for this quiz'
            });
        }

        console.log(`[Leaderboard] Fetching for Quiz ID: ${req.params.id}`);
        let leaderboard = await Response.getLeaderboard(req.params.id);

        // Privacy: Sanitize for students 
        if (req.user.role === 'student') {
            leaderboard = leaderboard.map(entry => ({
                ...entry,
                userId: {
                    _id: entry.userId?._id || entry.userId?.id,
                    name: entry.userId?.name,
                    avatar: entry.userId?.avatar,
                    // Remove sensitive info like email
                }
            }));
        }

        console.log(`[Leaderboard] Found ${leaderboard.length} entries`);

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

// @desc    Get comprehensive quiz analytics
// @route   GET /api/quiz/:id/analytics
// @access  Private (Faculty or Admin)
exports.getQuizAnalytics = async (req, res) => {
    try {
        const { id: quizId } = req.params;

        const quiz = await Quiz.findById(quizId).select('title code totalPoints questions').lean();
        if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found' });

        // 1. Leaderboard (Aggregated for accuracy)
        const leaderboard = await Response.find({ quizId, status: { $in: ['in-progress', 'completed'] } })
            .populate('userId', 'name rollNumber department section avatar')
            .sort({ totalScore: -1, totalTimeTaken: 1 })
            .limit(100)
            .lean();

        // 2. Question-wise stats
        const questionStats = await Response.aggregate([
            { $match: { quizId: new mongoose.Types.ObjectId(quizId) } },
            { $unwind: '$answers' },
            {
                $group: {
                    _id: '$answers.questionId',
                    correctCount: { $sum: { $cond: ['$answers.isCorrect', 1, 0] } },
                    totalAttempts: { $sum: { $cond: [{ $ifNull: ['$answers.answer', false] }, 1, 0] } },
                    avgTime: { $avg: '$answers.timeTaken' }
                }
            },
            {
                $project: {
                    questionId: '$_id',
                    accuracy: {
                        $cond: [
                            { $eq: ['$totalAttempts', 0] },
                            0,
                            { $multiply: [{ $divide: ['$correctCount', '$totalAttempts'] }, 100] }
                        ]
                    },
                    avgTime: 1,
                    correctCount: 1,
                    totalAttempts: 1
                }
            }
        ]);

        // 3. Overall performance metrics
        const overallMetrics = await Response.aggregate([
            { $match: { quizId: new mongoose.Types.ObjectId(quizId), status: 'completed' } },
            {
                $group: {
                    _id: null,
                    avgScore: { $avg: '$totalScore' },
                    highestScore: { $max: '$totalScore' },
                    lowestScore: { $min: '$totalScore' },
                    avgTime: { $avg: '$totalTimeTaken' },
                    totalParticipants: { $sum: 1 }
                }
            }
        ]);

        // 4. Student Breakdown (Detailed)
        const studentBreakdown = leaderboard.map(r => ({
            studentId: r.userId?._id,
            name: r.userId?.name,
            rollNumber: r.userId?.rollNumber,
            totalScore: r.totalScore,
            rank: r.rank,
            correctCount: r.correctCount,
            percentage: r.percentage,
            timeTaken: r.totalTimeTaken
        }));

        const metrics = overallMetrics[0] || { avgScore: 0, highestScore: 0, lowestScore: 0, avgTime: 0, totalParticipants: 0 };

        res.status(200).json({
            success: true,
            data: {
                leaderboard: studentBreakdown.slice(0, 10), // Top 10 for quick view
                questionStats,
                studentBreakdown,
                averageTime: metrics.avgTime,
                highestScore: metrics.highestScore,
                lowestScore: metrics.lowestScore,
                totalParticipants: metrics.totalParticipants,
                avgScore: metrics.avgScore
            }
        });

    } catch (error) {
        console.error('Quiz Analytics Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
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

        // --- Aggregation Pipeline (Requested by User) ---
        // Recalculates all stats from the answers array to ensure 100% accuracy
        const aggregatedResponses = await Response.aggregate([
            { $match: { quizId: quiz._id } },
            {
                $lookup: {
                    from: "users",
                    localField: "userId",
                    foreignField: "_id",
                    as: "studentInfo"
                }
            },
            { $unwind: { path: "$studentInfo", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    rank: 1,
                    status: 1,
                    startedAt: 1,
                    completedAt: 1,
                    totalTimeTaken: 1,
                    totalScore: { $sum: "$answers.scoreAwarded" }, // DB Level Summation
                    maxPossibleScore: 1,
                    percentage: 1,
                    tabSwitchCount: 1,
                    answers: 1,
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
                                cond: {
                                    $and: [
                                        { $eq: ["$$a.isCorrect", false] },
                                        { $gt: [{ $strLenCP: { $ifNull: ["$$a.answer", ""] } }, 0] }
                                    ]
                                }
                            }
                        }
                    },
                    student: {
                        id: { $ifNull: ["$studentInfo._id", "$userId"] },
                        name: { $ifNull: ["$studentInfo.name", "Unknown Student"] },
                        email: { $ifNull: ["$studentInfo.email", "N/A"] },
                        rollNumber: { $ifNull: ["$studentInfo.rollNumber", "N/A"] },
                        department: { $ifNull: ["$studentInfo.department", "N/A"] },
                        section: { $ifNull: ["$studentInfo.section", "N/A"] },
                        avatar: "$studentInfo.avatar"
                    }
                }
            },
            { $sort: { totalScore: -1, totalTimeTaken: 1 } }
        ]);

        // Map aggregated responses to include question details
        const mappedResponses = aggregatedResponses.map(r => {
            const detailedAnswers = r.answers.map(a => {
                const question = quiz.questions.id(a.questionId);
                return {
                    ...a,
                    questionText: question ? question.text : 'Question text unavailable',
                    correctAnswer: question ? question.correctAnswer : 'N/A',
                    options: question ? question.options : [],
                    points: question ? question.points : 0
                };
            });

            return {
                ...r,
                passed: r.percentage >= (quiz.settings.passingScore || 40),
                answers: detailedAnswers
            };
        });

        // --- Calculate Access-Based Metrics ---
        let totalEligible = 0;
        const access = quiz.accessControl;

        if (access) {
            if (access.mode === 'SPECIFIC') {
                totalEligible = access.allowedStudents ? access.allowedStudents.length : 0;
            } else if (!access.isPublic && access.allowedBranches && access.allowedBranches.length > 0) {
                // Calculate eligible students based on branch/section rules
                const conditions = access.allowedBranches.map(branch => {
                    const cond = {
                        department: branch.name,
                        role: 'student',
                        isActive: true
                    };
                    if (branch.sections && branch.sections.length > 0) {
                        cond.section = { $in: branch.sections };
                    }
                    return cond;
                });

                if (conditions.length > 0) {
                    totalEligible = await User.countDocuments({ $or: conditions });
                }
            } else {
                // Public quiz: eligibility equals attempts (dynamic pool)
                totalEligible = mappedResponses.length;
            }
        } else {
            totalEligible = mappedResponses.length;
        }

        // --- Core Metrics ---
        const attemptedCount = mappedResponses.length;
        const absentCount = Math.max(0, totalEligible - attemptedCount);

        // Filter out incomplete responses for score calculations if needed,
        // but typically all responses found are "attempts".
        // Use percentage for standardization
        const scores = mappedResponses.map(r => r.percentage);

        const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
        const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;
        const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

        const passingScore = quiz.settings.passingScore || 40;
        const passCount = scores.filter(s => s >= passingScore).length;
        const failCount = attemptedCount - passCount;

        // --- Question Analytics ---
        const questionAnalytics = quiz.questions.map((q, index) => {
            const correctResponses = mappedResponses.filter(r => {
                const answer = r.answers?.find(a => a.questionId?.toString() === q._id.toString());
                return answer?.isCorrect;
            });
            const correctCount = correctResponses.length;
            const accuracy = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;

            return {
                questionId: q._id,
                questionNumber: index + 1,
                text: q.text,
                type: q.type,
                correctAnswer: q.correctAnswer,
                difficulty: q.difficulty,
                points: q.points,
                attempts: attemptedCount, // Or count how many actually answered this question
                correctAttempts: correctCount, // Fix field name to match frontend expectation
                accuracy: accuracy,
                options: q.options
            };
        });

        // Calculate Absent Students
        let absentStudents = [];
        if (quiz.accessControl && !quiz.accessControl.isPublic && quiz.accessControl.allowedBranches?.length > 0) {
            const criteria = quiz.accessControl.allowedBranches.map(b => ({
                department: b.name,
                ...(b.sections.length > 0 ? { section: { $in: b.sections } } : {})
            }));

            if (criteria.length > 0) {
                const allowedUsers = await User.find({
                    role: 'student',
                    isActive: true,
                    $or: criteria
                }).select('_id name email department section rollNumber');

                // Helper to safely get ID string
                const getUserIdStr = (r) => r.userId ? r.userId._id.toString() : null;
                const respondedUserIds = new Set(mappedResponses.map(getUserIdStr).filter(Boolean));

                absentStudents = allowedUsers
                    .filter(u => !respondedUserIds.has(u._id.toString()))
                    .map(u => ({
                        id: u._id,
                        name: u.name,
                        email: u.email,
                        rollNumber: u.rollNumber,
                        department: u.department,
                        section: u.section
                    }));
            }
        }

        res.status(200).json({
            success: true,
            data: {
                quiz: {
                    _id: quiz._id,
                    title: quiz.title,
                    code: quiz.code,
                    status: quiz.status,
                    settings: quiz.settings,
                    accessControl: quiz.accessControl,
                    totalQuestions: quiz.questions.length,
                    totalPoints: quiz.totalPoints
                },
                analytics: {
                    totalParticipants: attemptedCount, // Frontend expects totalParticipants
                    completedCount: mappedResponses.filter(r => r.status === 'completed').length,
                    inProgressCount: mappedResponses.filter(r => r.status === 'in-progress').length,
                    waitingCount: mappedResponses.filter(r => r.status === 'waiting' || r.status === 'joined').length,
                    terminatedCount: mappedResponses.filter(r => r.status === 'terminated').length,
                    tabSwitchersCount: mappedResponses.filter(r => (r.tabSwitchCount || 0) > 0).length,
                    tabSwitchers: mappedResponses
                        .filter(r => (r.tabSwitchCount || 0) > 0)
                        .map(r => ({
                            name: r.student.name,
                            email: r.student.email,
                            count: r.tabSwitchCount,
                            terminated: r.status === 'terminated'
                        })),
                    avgScore: averageScore,
                    highestScore: highestScore,
                    lowestScore: lowestScore,
                    passRate: attemptedCount > 0 ? Math.round((passCount / attemptedCount) * 100) : 0,
                    passedCount: passCount,
                    failedCount: failCount,
                    avgTime: Math.round(mappedResponses.reduce((a, b) => a + (b.totalTimeTaken || 0), 0) / (attemptedCount || 1)),
                    participationRate: totalEligible > 0 ? Math.round((attemptedCount / totalEligible) * 100) : 100
                },
                responses: mappedResponses,
                questionAnalytics,
                leaderboard: mappedResponses.map(r => ({
                    student: r.student,
                    totalScore: r.totalScore,
                    maxPossibleScore: r.maxPossibleScore,
                    percentage: r.percentage,
                    totalTimeTaken: r.totalTimeTaken,
                    rank: r.rank,
                    status: r.status
                })),
                absentStudents
            }
        });
    } catch (error) {
        console.error('Get quiz results error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to calculate results',
            error: error.message
        });
    }
};

// @desc    Get live attendance for a quiz
// @route   GET /api/quizzes/:id/attendance
// @access  Private (Faculty owner or Admin)
exports.getQuizAttendance = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id)
            .select('accessControl participants createdBy')
            .populate('participants', '_id name rollNumber department section');

        if (!quiz) {
            return res.status(404).json({ success: false, message: 'Quiz not found' });
        }

        // Check ownership
        if (quiz.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const participantIds = new Set(quiz.participants.map(p => p._id.toString()));
        let eligibleStudents = [];
        const access = quiz.accessControl;

        // Determination of eligible students pool
        if (access && access.mode === 'SPECIFIC' && access.allowedStudents?.length > 0) {
            eligibleStudents = await User.find({ _id: { $in: access.allowedStudents } })
                .select('name rollNumber department section avatar')
                .lean();
        } else if (access && !access.isPublic && access.allowedBranches?.length > 0) {
            const criteria = access.allowedBranches.map(b => ({
                department: b.name,
                role: 'student',
                isActive: true,
                ...(b.sections?.length > 0 ? { section: { $in: b.sections } } : {})
            }));

            if (criteria.length > 0) {
                eligibleStudents = await User.find({ $or: criteria })
                    .select('name rollNumber department section avatar')
                    .lean();
            }
        } else {
            // If public, all active students are "eligible" to join
            eligibleStudents = await User.find({ role: 'student', isActive: true })
                .select('name rollNumber department section avatar')
                .lean();
        }

        // Merge eligible students with present status
        const attendanceMap = new Map();

        // 1. Initial Pass: Mark everything from eligible pool
        eligibleStudents.forEach(s => {
            attendanceMap.set(s._id.toString(), {
                id: s._id,
                name: s.name,
                rollNumber: s.rollNumber || 'N/A',
                department: s.department || 'N/A',
                section: s.section || 'N/A',
                status: participantIds.has(s._id.toString()) ? 'Present' : 'Absent'
            });
        });

        // 2. Second Pass: Add anyone who is present but wasn't in the eligible list (e.g. joined via PIN)
        quiz.participants.forEach(p => {
            if (!attendanceMap.has(p._id.toString())) {
                attendanceMap.set(p._id.toString(), {
                    id: p._id,
                    name: p.name,
                    rollNumber: p.rollNumber || 'N/A',
                    department: p.department || 'N/A',
                    section: p.section || 'N/A',
                    status: 'Present'
                });
            }
        });

        const attendanceList = Array.from(attendanceMap.values());

        res.status(200).json({
            success: true,
            data: attendanceList
        });
    } catch (error) {
        console.error('Attendance fetch error:', error);
        res.status(500).json({ success: false, message: error.message });
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

// @desc    Re-host quiz (Create a new session from existing)
// @route   POST /api/quizzes/:id/rehost
// @access  Private (Faculty owner)
exports.rehostQuiz = async (req, res) => {
    try {
        const originalQuiz = await Quiz.findById(req.params.id);

        if (!originalQuiz) {
            return res.status(404).json({
                success: false,
                message: 'Original quiz not found'
            });
        }

        // Check ownership
        if (originalQuiz.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            const logMsg = `🔒 [AUTH] Ownership Mismatch for Re-host: User ${req.user._id} (${req.user.role}) attempted to re-host Quiz ${originalQuiz._id} owned by ${originalQuiz.createdBy}`;
            console.warn(logMsg);
            return res.status(401).json({
                success: false,
                message: 'Not authorized to re-host this quiz'
            });
        }

        // Create a new quiz based on the original one
        const quizData = originalQuiz.toObject();
        delete quizData._id;
        delete quizData.id;
        delete quizData.code; // Will be regenerated by pre-save hook
        delete quizData.createdAt;
        delete quizData.updatedAt;

        // Reset dynamic fields
        quizData.participants = [];
        quizData.status = 'waiting'; // Set to WAITING immediately
        quizData.startedAt = null;
        quizData.endedAt = null;
        quizData.expiresAt = null;
        quizData.currentQuestionIndex = 0;

        const newQuiz = new Quiz(quizData);
        await newQuiz.save();

        res.status(201).json({
            success: true,
            message: 'New quiz session created for re-hosting',
            data: {
                quizId: newQuiz._id,
                code: newQuiz.code
            }
        });
    } catch (error) {
        console.error('Re-host quiz error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to re-host quiz',
            error: error.message
        });
    }
};
// @desc    Get detailed result for a specific student in a quiz
// @route   GET /api/quiz/:id/student/:studentId
// @access  Private (Faculty or Admin or the Student themselves)
exports.getStudentResult = async (req, res) => {
    try {
        const { id: quizId, studentId } = req.params;

        const quiz = await Quiz.findById(quizId).lean();
        if (!quiz) {
            return res.status(404).json({ success: false, message: 'Quiz not found' });
        }

        const response = await Response.findOne({ quizId, userId: studentId }).lean();
        if (!response) {
            return res.status(404).json({ success: false, message: 'No response found for this student' });
        }

        // Authorization check
        const isOwner = req.user.role === 'faculty' && String(quiz.createdBy) === String(req.user._id);
        const isAdmin = req.user.role === 'admin';
        const isSelf = String(req.user._id) === String(studentId);

        if (!isOwner && !isAdmin && !isSelf) {
            return res.status(403).json({ success: false, message: 'Not authorized to view these results' });
        }

        // Map question details into answers
        const detailedResults = response.answers.map((a, idx) => {
            const question = quiz.questions.find(q => String(q._id) === String(a.questionId));
            return {
                questionNumber: idx + 1,
                questionId: a.questionId,
                questionText: question ? question.text : 'Question text unavailable',
                type: question ? question.type : 'mcq',
                options: question ? question.options : [],
                selectedAnswer: a.answer,
                correctAnswer: question ? question.correctAnswer : 'N/A',
                isCorrect: a.isCorrect,
                scoreAwarded: a.scoreAwarded,
                maxPoints: question ? question.points : 0,
                timeTaken: a.timeTaken,
                explanation: question ? question.explanation : ''
            };
        });

        res.status(200).json({
            success: true,
            data: {
                studentId,
                quizId,
                quizTitle: quiz.title,
                totalScore: response.totalScore,
                maxPoints: response.maxPossibleScore,
                percentage: response.percentage,
                correctCount: response.correctCount,
                wrongCount: response.wrongCount,
                results: detailedResults
            }
        });
    } catch (error) {
        console.error('Get student result error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch student results' });
    }
};
