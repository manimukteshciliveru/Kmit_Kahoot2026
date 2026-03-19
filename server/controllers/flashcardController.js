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

// 💡 AI-Powered Flashcard Generation — supports topic, pasted content, and file uploads
exports.generateAIFlashcards = async (req, res) => {
    try {
        const { topic, subject, count = 10, content, mode = 'topic' } = req.body;
        const uploadedFile = req.file; // from multer

        let cards = [];

        if (mode === 'file' && uploadedFile) {
            // --- Mode 1: File Upload (PDF / DOCX) ---
            const ext = uploadedFile.originalname.split('.').pop().toLowerCase();
            let extractedText = '';

            if (ext === 'pdf') {
                extractedText = await aiGenerator.extractFromPDF(uploadedFile.path);
            } else if (ext === 'docx' || ext === 'doc') {
                extractedText = await aiGenerator.extractFromWord(uploadedFile.path);
            } else if (ext === 'pptx' || ext === 'ppt') {
                extractedText = await aiGenerator.extractFromPowerPoint(uploadedFile.path);
            } else {
                // Plain text file
                const fs = require('fs');
                extractedText = fs.readFileSync(uploadedFile.path, 'utf8');
            }

            const prompt = `Based on this content, generate ${count} flashcard Q&A pairs for the subject ${subject || 'General'}.\n\nCONTENT:\n${extractedText.slice(0, 8000)}`;
            cards = await aiGenerator.generateFlashcards(prompt, subject || 'Uploaded File', count, req.user._id);

            // Cleanup temp file
            const fs = require('fs');
            if (fs.existsSync(uploadedFile.path)) fs.unlinkSync(uploadedFile.path);

        } else if (mode === 'content' && content) {
            // --- Mode 2: Pasted Text Content ---
            const prompt = `Based on this text, generate ${count} flashcard Q&A pairs for the subject ${subject || 'General'}.\n\nTEXT:\n${content.slice(0, 8000)}`;
            cards = await aiGenerator.generateFlashcards(prompt, subject || 'Pasted Content', count, req.user._id);

        } else {
            // --- Mode 3 (Default): Topic/Keyword ---
            if (!topic) return res.status(400).json({ success: false, message: 'Please provide a topic.' });
            cards = await aiGenerator.generateFlashcards(topic, subject, count, req.user._id);
        }

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
