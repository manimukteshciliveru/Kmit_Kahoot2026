const express = require('express');
const router = express.Router();
const {
    generateFromFile,
    generateFromText,
    generateFromTranscript,
    upload
} = require('../controllers/aiController');
const { protect, authorize } = require('../middleware/auth');

// All routes require authentication and faculty role
router.use(protect);
router.use(authorize('faculty', 'admin'));

// AI generation routes
router.post('/generate-from-file', upload.array('files', 10), generateFromFile);
router.post('/generate-from-text', generateFromText);
router.post('/generate-from-transcript', generateFromTranscript);

module.exports = router;
