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
        }

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

        quiz.status = 'active';
        quiz.startedAt = new Date();
        quiz.currentQuestionIndex = 0;

        // Set expiration time if quiz timer is set
        // Adding a 5 second buffer for network latency
        if (quiz.settings?.quizTimer > 0) {
            quiz.expiresAt = new Date(quiz.startedAt.getTime() + (quiz.settings.quizTimer * 1000) + 5000);
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

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`quiz:${quiz._id}`).emit('quiz:started', {
                quizId: quiz._id,
                startedAt: quiz.startedAt,
                expiresAt: quiz.expiresAt,
                currentQuestionIndex: 0,
                totalQuestions: quiz.questions.length,
                questions: quiz.questions.map(q => ({
                    ...q.toObject(),
                    correctAnswer: undefined, // Hide correct answer
                    explanation: undefined
                })),
                settings: quiz.settings
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

        quiz.status = 'completed';
        quiz.endedAt = new Date();
        await quiz.save();

        // Find all in-progress responses and force complete them
        // We do this individually to trigger calculation hooks
        const activeResponses = await Response.find({
            quizId: quiz._id,
            status: { $in: ['in-progress', 'waiting'] }
        });

        console.log(`[END QUIZ] Force completing ${activeResponses.length} active responses`);

        const completionPromises = activeResponses.map(async (response) => {
            response.status = 'completed';
            response.completedAt = new Date();
            response.terminationReason = 'manual'; // Marked as manually ended by host
            // Hook will calculate final scores
            return response.save();
        });

        await Promise.all(completionPromises);

        // Update ranks after all scores are finalized
        await Response.updateRanks(quiz._id);

        // Get final leaderboard
        const leaderboard = await Response.getLeaderboard(quiz._id);

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            console.log(`[END QUIZ] Emitting quiz:ended event`);
            io.to(`quiz:${quiz._id}`).emit('quiz:ended', {
                quizId: quiz._id,
                endedAt: quiz.endedAt,
                leaderboard,
                autoEnded: false
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
                    name: entry.userId?.name,
                    avatar: entry.userId?.avatar,
                    // Remove email, rollNumber, etc.
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
            .populate('userId', 'name email avatar department section rollNumber')
            .sort({ rank: 1, totalScore: -1, totalTimeTaken: 1 })
            .lean();

        // --- Map Responses for Frontend (Fix undefined student error) ---
        const mappedResponses = responses.map(r => {
            const student = r.userId || {
                name: 'Unknown User',
                email: 'deleted@user.com',
                rollNumber: 'N/A',
                department: 'N/A',
                section: 'N/A'
            }; // Fallback for deleted users

            return {
                _id: r._id,
                rank: r.rank,
                student: {
                    id: student._id,
                    name: student.name,
                    email: student.email,
                    rollNumber: student.rollNumber,
                    department: student.department || 'N/A',
                    section: student.section || 'N/A',
                    avatar: student.avatar
                },
                totalScore: r.totalScore,
                maxPossibleScore: r.maxPossibleScore,
                percentage: r.percentage,
                correctCount: r.correctCount,
                wrongCount: r.wrongCount,
                unansweredCount: r.unansweredCount,
                totalTimeTaken: r.totalTimeTaken,
                status: r.status,
                passed: r.percentage >= (quiz.settings.passingScore || 40),
                tabSwitchCount: r.tabSwitchCount || 0,
                // Include answers for detailed view if needed, but maybe sanitize or limit
                answers: r.answers
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
                totalEligible = responses.length;
            }
        } else {
            totalEligible = responses.length;
        }

        // --- Core Metrics ---
        const attemptedCount = responses.length;
        const absentCount = Math.max(0, totalEligible - attemptedCount);

        // Filter out incomplete responses for score calculations if needed,
        // but typically all responses found are "attempts".
        // Use percentage for standardization
        const scores = responses.map(r => r.percentage);

        const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
        const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;
        const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

        const passingScore = quiz.settings.passingScore || 40;
        const passCount = scores.filter(s => s >= passingScore).length;
        const failCount = attemptedCount - passCount;

        // --- Question Analytics ---
        const questionAnalytics = quiz.questions.map((q, index) => {
            const correctResponses = responses.filter(r => {
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
                const respondedUserIds = new Set(responses.map(getUserIdStr).filter(Boolean));

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
                    completedCount: responses.filter(r => r.status === 'completed').length,
                    inProgressCount: responses.filter(r => r.status === 'in-progress').length,
                    waitingCount: responses.filter(r => r.status === 'waiting').length,
                    terminatedCount: responses.filter(r => r.status === 'terminated').length,
                    totalEligible,
                    attempted: attemptedCount,
                    absent: absentCount,
                    highestScore,
                    lowestScore,
                    avgScore: averageScore, // Frontend expects avgScore
                    avgTime: responses.length > 0 ? responses.reduce((acc, r) => acc + (r.totalTimeTaken || 0), 0) / responses.length : 0,
                    participationRate: totalEligible > 0 ? Math.round((attemptedCount / totalEligible) * 100) : 0,
                    passRate: attemptedCount > 0 ? Math.round((passCount / attemptedCount) * 100) : 0,
                    passedCount: passCount,
                    failedCount: failCount,
                    passingScore,
                    tabSwitchersCount: responses.filter(r => (r.tabSwitchCount || 0) > 0).length,
                    tabSwitchers: responses.filter(r => (r.tabSwitchCount || 0) > 0).map(r => ({
                        name: r.userId ? r.userId.name : 'Unknown',
                        email: r.userId ? r.userId.email : 'N/A',
                        count: r.tabSwitchCount,
                        terminated: r.status === 'terminated'
                    }))
                },
                responses: mappedResponses,
                // Leaderboard view (could be same as responses or subset)
                leaderboard: mappedResponses,
                questionAnalytics,
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

// Helper function to shuffle array
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// @desc    Reset quiz (allow re-hosting)
// @route   POST /api/quizzes/:id/reset
// @access  Private (Faculty owner)
exports.resetQuiz = async (req, res) => {
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
                message: 'Not authorized to reset this quiz'
            });
        }

        // Reset Quiz State
        quiz.status = 'draft'; // Set to draft so it appears in list but not active yet
        quiz.participants = [];
        quiz.startedAt = null;
        quiz.endedAt = null;
        quiz.expiresAt = null; // Important: Clear scheduled/expiration times
        quiz.currentQuestionIndex = 0;
        await quiz.save();

        // Delete all responses for this quiz (this wipes previous data)
        // If you want to archive, you'd need a Session model, but for now simple reset is requested.
        await Response.deleteMany({ quizId: quiz._id });

        // Force cache invalidation if using Redis/Memory (optional)
        const io = req.app.get('io');
        if (io) {
            io.to(`quiz:${quiz._id}`).emit('quiz:reset');
        }

        res.status(200).json({
            success: true,
            message: 'Quiz reset successfully',
            data: { quiz }
        });
    } catch (error) {
        console.error('Reset quiz error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset quiz',
            error: error.message
        });
    }
};
