const Flashcard = require('../models/Flashcard');
const aiGenerator = require('../services/aiGenerator'); 


// Create a new Flashcard set
exports.createFlashcardSet = async (req, res) => {
    try {
        const { title, subject, cards, isPublic } = req.body;
        const newSet = new Flashcard({
            userId: req.user._id,
            title,
            subject,
            cards,
            isPublic
        });
        await newSet.save();
        res.status(201).json({ success: true, data: newSet });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// Get all the user's flashcard sets
exports.getMyFlashcardSets = async (req, res) => {
    try {
        const sets = await Flashcard.find({ userId: req.user._id })
            .sort({ updatedAt: -1 });
        res.json({ success: true, data: sets });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update a card's mastery (Gamification Logic)
exports.updateCardMastery = async (req, res) => {
    try {
        const { setId, cardIndex, confidence } = req.body; // confidence: 1 (hard), 3 (medium), 5 (easy)
        const set = await Flashcard.findById(setId);
        if (!set) return res.status(404).json({ success: false, message: 'Set not found' });

        // Guard: Check if the index is valid
        if (!set.cards[cardIndex]) return res.status(400).json({ success: false, message: 'Invalid card index' });

        set.cards[cardIndex].masteryScore += confidence;
        set.cards[cardIndex].lastReviewed = new Date();
        
        await set.save();
        res.json({ success: true, data: set.cards[cardIndex] });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// 💡 AI-Powered Flashcard Generation (Fast Topic Learning)
exports.generateAIFlashcards = async (req, res) => {
    try {
        const { topic, subject, count = 10 } = req.body;
        
        const cards = await aiGenerator.generateFlashcards(topic, subject, count, req.user._id);

        res.json({ 
            success: true, 
            count: cards.length, 
            data: cards 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'AI Generation failed: ' + error.message });
    }
};

// Delete a set
exports.deleteFlashcardSet = async (req, res) => {
    try {
        await Flashcard.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
        res.json({ success: true, message: 'Set deleted successfully' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
