const express = require('express');
const router = express.Router();
const {
    createFlashcardSet,
    getMyFlashcardSets,
    updateCardMastery,
    generateAIFlashcards,
    deleteFlashcardSet
} = require('../controllers/flashcardController');
const { protect } = require('../middleware/auth');

// All routes are protected
router.use(protect);

router.post('/', createFlashcardSet);
router.get('/', getMyFlashcardSets);
router.patch('/mastery', updateCardMastery);
router.post('/generate', generateAIFlashcards);
router.delete('/:id', deleteFlashcardSet);

module.exports = router;
