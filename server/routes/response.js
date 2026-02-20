const express = require('express');
const router = express.Router();
const {
    submitAnswer,
    getMyResponse,
    getResponseById,
    getQuizResponses,
    reportTabSwitch,
    completeQuiz,
    getQuizHistory
} = require('../controllers/responseController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
    submitAnswer: submitAnswerSchema,
    reportTabSwitch: reportTabSwitchSchema,
    completeQuiz: completeQuizSchema
} = require('../validations/response.validation');

// All routes require authentication
router.use(protect);

// Student routes
router.post('/answer', authorize('student'), validate(submitAnswerSchema), submitAnswer);
router.post('/tab-switch', authorize('student'), validate(reportTabSwitchSchema), reportTabSwitch);
router.post('/complete', authorize('student'), validate(completeQuizSchema), completeQuiz);
router.get('/history', authorize('student'), getQuizHistory);
router.get('/quiz/:quizId', getMyResponse);
router.get('/:id', getResponseById);

// Faculty routes
router.get('/quiz/:quizId/all', authorize('faculty', 'admin'), getQuizResponses);

module.exports = router;
