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
    getLeaderboard,
    getQuizResults
} = require('../controllers/quizController');
const { protect, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Quiz CRUD
router.route('/')
    .get(getQuizzes)
    .post(authorize('faculty', 'admin'), createQuiz);

// Quiz actions - MUST come before /:id routes to avoid matching catch-all
router.post('/join/:code', joinQuiz);
router.post('/:id/start', authorize('faculty', 'admin'), startQuiz);
router.post('/:id/end', authorize('faculty', 'admin'), endQuiz);

// Specific quiz operations - these must come AFTER the specific routes above
router.route('/:id')
    .get(getQuiz)
    .put(authorize('faculty', 'admin'), updateQuiz)
    .delete(authorize('faculty', 'admin'), deleteQuiz);

// Quiz data
router.get('/:id/leaderboard', getLeaderboard);
router.get('/:id/results', authorize('faculty', 'admin'), getQuizResults);

module.exports = router;
