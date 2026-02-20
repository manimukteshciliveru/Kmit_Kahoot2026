const { protect, authorize } = require('../middleware/auth');
const express = require('express');
const router = express.Router();
const {
    createQuiz,
    getQuizzes,
    getQuiz,
    updateQuiz,
    deleteQuiz,
    joinQuiz,
    startQuiz,
    endQuiz,
    rehostQuiz,
    getLeaderboard,
    getQuizResults,
    getQuizAttendance
} = require('../controllers/quizController');
const strictLimiter = require('../middleware/strictRateLimiter');
const { getDetailedAnalytics } = require('../controllers/analyticsController');

const { upload } = require('../utils/cloudinary');
const validate = require('../middleware/validate');
const { createQuiz: createQuizSchema, updateQuiz: updateQuizSchema } = require('../validations/quiz.validation');

// Helper middleware to parse stringified JSON fields from multipart form-data
const parseMultipartJSON = (fields) => (req, res, next) => {
    fields.forEach(field => {
        if (req.body[field] && typeof req.body[field] === 'string') {
            try {
                req.body[field] = JSON.parse(req.body[field]);
            } catch (err) {
                // If it fails, let Joi catch the type mismatch
            }
        }
    });
    next();
};

// All routes require authentication
router.use(protect);

// Quiz CRUD
router.route('/')
    .get(getQuizzes)
    .post(
        authorize('faculty', 'admin'),
        upload.single('coverImage'),
        parseMultipartJSON(['settings', 'questions', 'accessControl']),
        validate(createQuizSchema),
        createQuiz
    );

// Quiz actions - MUST come before /:id routes
// Apply Strict Rate Limit to Join
router.post('/join/:code', strictLimiter, joinQuiz);

router.post('/:id/start', authorize('faculty', 'admin'), startQuiz);
router.post('/:id/end', authorize('faculty', 'admin'), endQuiz);
router.post('/:id/rehost', authorize('faculty', 'admin'), rehostQuiz);

// Specific quiz operations - these must come AFTER the specific routes above
router.route('/:id')
    .get(getQuiz)
    .put(
        authorize('faculty', 'admin'),
        upload.single('coverImage'),
        parseMultipartJSON(['settings', 'questions', 'accessControl']),
        validate(updateQuizSchema),
        updateQuiz
    )
    .delete(authorize('faculty', 'admin'), deleteQuiz);

// Quiz data & Analytics
router.get('/:id/leaderboard', getLeaderboard);
router.get('/:id/results', authorize('faculty', 'admin'), getQuizResults);
router.get('/:id/attendance', authorize('faculty', 'admin'), getQuizAttendance);
router.get('/:id/report', authorize('faculty', 'admin'), require('../controllers/reportController').downloadReport);

// Advanced Analytics (Enterprise Feature)
router.get('/:id/analytics/advanced', authorize('faculty', 'admin'), getDetailedAnalytics);

module.exports = router;
