const Response = require('../models/Response');
const Quiz = require('../models/Quiz');
const User = require('../models/User');
const { calculateScore } = require('../utils/calculateScore');

// @desc    Submit answer for a question
// @route   POST /api/responses/answer
// @access  Private (Student)
exports.submitAnswer = async (req, res) => {
    try {
        const { quizId, questionId, answer, timeTaken } = req.body;

        // Validate input
        if (!quizId || !questionId) {
            return res.status(400).json({
                success: false,
                message: 'Quiz ID and Question ID are required'
            });
        }

        // Get quiz
        const quiz = await Quiz.findById(quizId);
        if (!quiz) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found'
            });
        }

        // Accept both legacy "active" and new state-machine "question_active"
        if (!['active', 'question_active'].includes(quiz.status)) {
            return res.status(400).json({
                success: false,
                message: 'Quiz is not active'
            });
        }

        // Timer Integrity Check
        // 1. Check if quiz is expired (database field)
        if (quiz.expiresAt && new Date() > new Date(quiz.expiresAt)) {
            return res.status(400).json({
                success: false,
                message: 'Quiz time has expired'
            });
        }

        // 2. Check if calculated time exceeded (redundant but safe)
        if (quiz.settings?.quizTimer > 0 && quiz.startedAt) {
            const start = new Date(quiz.startedAt).getTime();
            const now = new Date().getTime();
            const elapsed = Math.floor((now - start) / 1000);

            // Allow 10s grace period for network latency
            if (elapsed > quiz.settings.quizTimer + 10) {
                return res.status(400).json({
                    success: false,
                    message: 'Quiz time has expired'
                });
            }
        }

        // Find the question in quiz
        const question = quiz.questions.id(questionId);
        if (!question) {
            return res.status(404).json({
                success: false,
                message: 'Question not found'
            });
        }

        // Check if answer is correct (Using Centralized Utility)
        const timeInSeconds = timeTaken && timeTaken > 100 ? timeTaken / 1000 : (timeTaken || 0);
        const { isCorrect, pointsEarned } = calculateScore(question, answer, timeInSeconds, quiz.settings);

        // --- DEBUG LOGS (Requested by User) ---
        console.log(`[SCORE DEBUG] Student: ${req.user._id} (${req.user.name})`);
        console.log(`[SCORE DEBUG] Quiz: ${quizId} | Question: ${questionId}`);
        console.log(`[SCORE DEBUG] Selected: "${answer}" | Correct: "${question.correctAnswer}"`);
        console.log(`[SCORE DEBUG] Result: ${isCorrect ? '✅ CORRECT' : '❌ WRONG'} | Score: ${pointsEarned}`);

        // Find existing response to update
        const response = await Response.findOne({
            quizId,
            userId: req.user._id,
            status: { $in: ['waiting', 'in-progress'] }
        });

        if (!response) {
            return res.status(400).json({
                success: false,
                message: 'No active response found for this quiz'
            });
        }

        // Find the index of the answer in the array
        const answerIndex = response.answers.findIndex(a => a.questionId.toString() === questionId.toString());

        if (answerIndex > -1 && response.answers[answerIndex].answer) {
            // Answer already exists. 
            // Logic: Usually for live quizzes, we don't allow re-submission.
            // If we want to allow it, we would just proceed. 
            // Let's add a log and allow it for now but ensure we aren't creating duplicates.
            console.log(`[SUBMIT] Student ${req.user.name} is re-submitting for question ${questionId}`);
        }

        if (answerIndex === -1) {
            // This could happen if the response was created without this question placeholder
            // In a production-grade app, we should add it
            response.answers.push({
                questionId,
                questionIndex: quiz.questions.findIndex(q => q._id.toString() === questionId.toString()),
                answer,
                isCorrect,
                pointsEarned,
                timeTaken: timeTaken || 0,
                answeredAt: new Date()
            });
        } else {
            // Update existing placeholder
            response.answers[answerIndex].answer = answer;
            response.answers[answerIndex].isCorrect = isCorrect;
            response.answers[answerIndex].pointsEarned = pointsEarned;
            response.answers[answerIndex].timeTaken = timeTaken || 0;
            response.answers[answerIndex].answeredAt = new Date();
        }

        response.status = 'in-progress';
        response.lastActivityAt = new Date();

        // Save the document - this triggers the pre-save hook in Response.js
        // which recalculates totalScore, correctCount, percentage, etc.
        await response.save();

        // Emit real-time update for faculty and leaderboard
        const io = req.app.get('io');
        if (io) {
            // Get freshly updated leaderboard
            const leaderboard = await Response.getLeaderboard(quizId, 200);

            // 1. Standard Leaderboard update
            io.to(String(quizId)).emit('leaderboard:update', { leaderboard });

            // 2. Requested event name for compatibility if needed
            io.to(String(quizId)).emit('leaderboardUpdate', { leaderboard });

            // Notify faculty of detailed response with mapped fields
            io.to(`${quizId}:host`).emit('response:received', {
                participantId: req.user._id,
                participantName: req.user.name,
                rollNumber: req.user.rollNumber,
                department: req.user.department,
                section: req.user.section,
                questionId,
                isCorrect,
                pointsEarned,
                timeTaken,
                score: response.totalScore,
                totalScore: response.totalScore
            });
        }

        // Prepare feedback
        const feedback = quiz.settings.showInstantFeedback ? {
            isCorrect,
            pointsEarned,
            correctAnswer: quiz.settings.showCorrectAnswer ? question.correctAnswer : undefined,
            explanation: question.explanation
        } : {};

        res.status(200).json({
            success: true,
            message: 'Answer submitted',
            data: {
                feedback,
                currentScore: response.totalScore,
                answeredCount: response.answers.filter(a => a.answer).length
            }
        });
    } catch (error) {
        console.error('Submit answer error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit answer',
            error: error.message
        });
    }
};

// @desc    Get student's response for a quiz
// @route   GET /api/responses/quiz/:quizId
// @access  Private
exports.getMyResponse = async (req, res) => {
    try {
        const response = await Response.findOne({
            quizId: req.params.quizId,
            userId: req.user._id
        }).populate('quizId', 'title code questions settings');

        if (!response) {
            // For production robustness: Return 200 with null instead of 404 to avoid console noise
            // during race conditions or when faculty members preview the play page.
            return res.status(200).json({
                success: true,
                data: { response: null }
            });
        }

        let responseData = response.toObject();

        // Sanitize if active and student
        if (req.user.role === 'student' && responseData.quizId && responseData.quizId.status === 'active') {
            responseData.quizId.questions = responseData.quizId.questions.map(q => ({
                ...q,
                correctAnswer: undefined,
                explanation: undefined
            }));
        }

        res.status(200).json({
            success: true,
            data: { response: responseData }
        });
    } catch (error) {
        console.error('Get response error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch response',
            error: error.message
        });
    }
};

// @desc    Get response by ID
// @route   GET /api/responses/:id
// @access  Private
exports.getResponseById = async (req, res) => {
    try {
        const response = await Response.findById(req.params.id)
            .populate({
                path: 'quizId',
                select: 'title subject code createdBy startedAt endedAt questions settings accessControl participants',
                populate: {
                    path: 'createdBy',
                    select: 'name'
                }
            });

        if (!response) {
            return res.status(404).json({
                success: false,
                message: 'Response not found'
            });
        }

        // Calculate basic attendance stats for student view
        let totalEligible = 0;
        const quiz = response.quizId;
        const attempted = await Response.countDocuments({ quizId: quiz._id });

        if (quiz.accessControl) {
            if (quiz.accessControl.mode === 'SPECIFIC') {
                totalEligible = quiz.accessControl.allowedStudents?.length || 0;
            } else if (!quiz.accessControl.isPublic && quiz.accessControl.allowedBranches?.length > 0) {
                const conditions = quiz.accessControl.allowedBranches.map(branch => {
                    const cond = { department: branch.name, role: 'student', isActive: true };
                    if (branch.sections?.length > 0) cond.section = { $in: branch.sections };
                    return cond;
                });
                totalEligible = await User.countDocuments({ $or: conditions });
            } else {
                totalEligible = attempted; // Public
            }
        } else {
            totalEligible = attempted;
        }

        const stats = {
            totalEligible,
            totalJoined: attempted,
            participationRate: totalEligible > 0 ? Math.round((attempted / totalEligible) * 100) : 100
        };

        // Authorization check
        if (response.userId.toString() !== req.user._id.toString() &&
            req.user.role !== 'admin' &&
            response.quizId?.createdBy?.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this response'
            });
        }

        // Map question details into answers for detailed review
        const detailedAnswers = response.answers.map(a => {
            const question = quiz.questions.id(a.questionId);
            return {
                ...a.toObject(),
                questionText: question ? question.text : 'Question not found',
                correctAnswer: question ? question.correctAnswer : 'N/A',
                options: question ? question.options : [],
                points: question ? question.points : 0,
                explanation: question ? question.explanation : ''
            };
        });

        const finalResponse = response.toObject();
        finalResponse.answers = detailedAnswers;

        res.status(200).json({
            success: true,
            data: {
                response: finalResponse,
                stats
            }
        });
    } catch (error) {
        console.error('Get response by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch response',
            error: error.message
        });
    }
};

// @desc    Get all responses for a quiz (Faculty)
// @route   GET /api/responses/quiz/:quizId/all
// @access  Private (Faculty/Admin)
exports.getQuizResponses = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.quizId);

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
                message: 'Not authorized to view responses'
            });
        }

        const responses = await Response.find({ quizId: req.params.quizId })
            .populate('userId', 'name email avatar rollNumber department section')
            .sort({ rank: 1, totalScore: -1 });

        res.status(200).json({
            success: true,
            data: { responses }
        });
    } catch (error) {
        console.error('Get quiz responses error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch responses',
            error: error.message
        });
    }
};

// @desc    Report tab switch
// @route   POST /api/responses/tab-switch
// @access  Private (Student)
exports.reportTabSwitch = async (req, res) => {
    try {
        const { quizId } = req.body;

        const quiz = await Quiz.findById(quizId);
        if (!quiz) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found'
            });
        }

        const response = await Response.findOne({ quizId, userId: req.user._id });
        if (!response) {
            return res.status(404).json({
                success: false,
                message: 'Response not found'
            });
        }

        response.tabSwitchCount += 1;

        // Check if should terminate
        const maxSwitches = quiz.settings.maxTabSwitches || 0;
        const shouldTerminate = !quiz.settings.allowTabSwitch ||
            (maxSwitches > 0 && response.tabSwitchCount > maxSwitches);

        if (shouldTerminate) {
            response.status = 'terminated';
            response.terminationReason = 'tab-switch';
            response.completedAt = new Date();
        }

        await response.save();

        // Notify faculty
        const io = req.app.get('io');
        if (io) {
            io.to(`${quizId}:host`).emit('participant:tabswitch', {
                participantId: req.user._id,
                participantName: req.user.name,
                tabSwitchCount: response.tabSwitchCount,
                terminated: shouldTerminate
            });
        }

        res.status(200).json({
            success: true,
            data: {
                tabSwitchCount: response.tabSwitchCount,
                terminated: shouldTerminate,
                message: shouldTerminate
                    ? 'Quiz terminated due to tab switching'
                    : `Warning: Tab switch detected (${response.tabSwitchCount}/${maxSwitches || 'unlimited'})`
            }
        });
    } catch (error) {
        console.error('Report tab switch error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to report tab switch',
            error: error.message
        });
    }
};

// @desc    Complete quiz submission
// @route   POST /api/responses/complete
// @access  Private (Student)
exports.completeQuiz = async (req, res) => {
    try {
        const { quizId } = req.body;

        const response = await Response.findOne({ quizId, userId: req.user._id });
        if (!response) {
            return res.status(404).json({
                success: false,
                message: 'Response not found'
            });
        }

        if (response.status === 'completed' || response.status === 'terminated') {
            console.log(`ℹ️  [COMPLETE QUIZ] User ${req.user.name} already in ${response.status} state. Returning success.`);
            return res.status(200).json({
                success: true,
                message: `Quiz already ${response.status}`,
                data: {
                    response: {
                        totalScore: response.totalScore,
                        percentage: response.percentage,
                        correctCount: response.correctCount,
                        wrongCount: response.wrongCount,
                        rank: response.rank,
                        totalTimeTaken: response.totalTimeTaken
                    }
                }
            });
        }

        console.log(`🏁 [COMPLETE QUIZ] Marking ${req.user.name} as completed`);
        response.status = 'completed';
        response.completedAt = new Date();
        await response.save();

        // Update ranks
        await Response.updateRanks(quizId);

        // Get updated response with rank
        const updatedResponse = await Response.findById(response._id);

        // Update user stats
        await User.findByIdAndUpdate(req.user._id, {
            $inc: { 'stats.totalPoints': response.totalScore }
        });

        // Update average score
        const user = await User.findById(req.user._id);
        const allResponses = await Response.find({ userId: req.user._id, status: 'completed' });
        const avgScore = allResponses.reduce((sum, r) => sum + r.percentage, 0) / allResponses.length;
        await User.findByIdAndUpdate(req.user._id, {
            $set: { 'stats.averageScore': Math.round(avgScore) }
        });

        // Emit leaderboard update
        const io = req.app.get('io');
        if (io) {
            const leaderboard = await Response.getLeaderboard(quizId);
            io.to(String(quizId)).emit('leaderboard:update', { leaderboard });
        }

        res.status(200).json({
            success: true,
            message: 'Quiz completed successfully',
            data: {
                response: {
                    totalScore: updatedResponse.totalScore,
                    percentage: updatedResponse.percentage,
                    correctCount: updatedResponse.correctCount,
                    wrongCount: updatedResponse.wrongCount,
                    rank: updatedResponse.rank,
                    totalTimeTaken: updatedResponse.totalTimeTaken
                }
            }
        });
    } catch (error) {
        console.error('Complete quiz error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to complete quiz',
            error: error.message
        });
    }
};

// @desc    Get student's quiz history
// @route   GET /api/responses/history
// @access  Private (Student)
exports.getQuizHistory = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const responses = await Response.find({ userId: req.user._id })
            .populate({
                path: 'quizId',
                select: 'title subject createdBy startedAt endedAt questions',
                populate: {
                    path: 'createdBy',
                    select: 'name'
                }
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Response.countDocuments({ userId: req.user._id });

        res.status(200).json({
            success: true,
            data: {
                responses,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        console.error('Get quiz history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch history',
            error: error.message
        });
    }
};

// Helper function to check answers
function checkAnswer(question, answer) {
    if (!answer) return false;

    const normalize = (str) => str.toString().toLowerCase().trim();

    switch (question.type) {
        case 'mcq':
            return normalize(answer) === normalize(question.correctAnswer);

        case 'fill-blank':
            // For fill in the blank, check exact match or similar
            const correctAnswers = question.correctAnswer.split('|').map(a => normalize(a));
            return correctAnswers.includes(normalize(answer));

        case 'qa':
            // For Q&A, might need more sophisticated checking
            // For now, check if answer contains key terms
            const userAnswer = normalize(answer);
            const expected = normalize(question.correctAnswer);

            // Simple word matching (could be enhanced with AI)
            const expectedWords = expected.split(/\s+/).filter(w => w.length > 3);
            const matchedWords = expectedWords.filter(w => userAnswer.includes(w));
            return matchedWords.length >= expectedWords.length * 0.6;

        default:
            return false;
    }
}
