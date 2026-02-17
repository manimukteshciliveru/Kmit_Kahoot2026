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
    resetQuiz,
    getLeaderboard,
    getQuizResults
} = require('../controllers/quizController');
const strictLimiter = require('../middleware/strictRateLimiter');
const { getDetailedAnalytics } = require('../controllers/analyticsController');

// All routes require authentication
router.use(protect);

// Quiz CRUD
router.route('/')
    .get(getQuizzes)
    .post(authorize('faculty', 'admin'), createQuiz);

// Quiz actions - MUST come before /:id routes
// Apply Strict Rate Limit to Join
router.post('/join/:code', strictLimiter, joinQuiz);

router.post('/:id/start', authorize('faculty', 'admin'), startQuiz);
router.post('/:id/end', authorize('faculty', 'admin'), endQuiz);
router.post('/:id/reset', authorize('faculty', 'admin'), resetQuiz);

// Specific quiz operations - these must come AFTER the specific routes above
router.route('/:id')
    .get(getQuiz)
    .put(authorize('faculty', 'admin'), updateQuiz)
    .delete(authorize('faculty', 'admin'), deleteQuiz);

// Quiz data & Analytics
router.get('/:id/leaderboard', getLeaderboard);
router.get('/:id/results', authorize('faculty', 'admin'), getQuizResults);
router.get('/:id/report', authorize('faculty', 'admin'), require('../controllers/reportController').downloadReport);

// Advanced Analytics (Enterprise Feature)
router.get('/:id/analytics/advanced', authorize('faculty', 'admin'), getDetailedAnalytics);

module.exports = router;
