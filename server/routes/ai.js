const express = require('express');
const router = express.Router();
const {
    generateFromFile,
    generateFromText,
    generateFromTranscript,
    explainQuestion,
    generateReview
} = require('../controllers/aiController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
    generateFromFile: generateFromFileSchema,
    generateFromText: generateFromTextSchema
} = require('../validations/ai.validation');

const { documentUpload } = require('../utils/cloudinary');

// All routes require authentication
router.use(protect);

// Student capable routes
router.post('/explain', authorize('faculty', 'student', 'admin'), explainQuestion);
router.get('/review/:quizId', authorize('student', 'faculty', 'admin'), generateReview);

// Faculty only routes
router.use(authorize('faculty', 'admin'));

// AI generation routes
router.post('/generate-from-file', documentUpload.array('files', 10), validate(generateFromFileSchema), generateFromFile);
router.post('/generate-from-text', validate(generateFromTextSchema), generateFromText);
router.post('/generate-from-transcript', generateFromTranscript);

module.exports = router;
