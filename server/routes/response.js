const express = require('express');
const router = express.Router();
const {
    submitAnswer,
    getMyResponse,
    getQuizResponses,
    reportTabSwitch,
    completeQuiz,
    getQuizHistory
} = require('../controllers/responseController');
const { protect, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Student routes
router.post('/answer', authorize('student'), submitAnswer);
router.post('/tab-switch', authorize('student'), reportTabSwitch);
router.post('/complete', authorize('student'), completeQuiz);
router.get('/history', authorize('student'), getQuizHistory);
router.get('/quiz/:quizId', getMyResponse);

// Faculty routes
router.get('/quiz/:quizId/all', authorize('faculty', 'admin'), getQuizResponses);

module.exports = router;
