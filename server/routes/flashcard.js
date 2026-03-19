const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const {
    createFlashcardSet,
    getMyFlashcardSets,
    updateCardMastery,
    generateAIFlashcards,
    deleteFlashcardSet
} = require('../controllers/flashcardController');
const { protect } = require('../middleware/auth');

// Multer config — store files temporarily in uploads/flashcards/
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../uploads/flashcards');
        require('fs').mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF, DOCX, PPTX, and TXT files are allowed'));
        }
    }
});

// All routes are protected
router.use(protect);

router.post('/', createFlashcardSet);
router.get('/', getMyFlashcardSets);
router.patch('/mastery', updateCardMastery);
router.post('/generate', upload.single('file'), generateAIFlashcards);
router.delete('/:id', deleteFlashcardSet);

module.exports = router;
