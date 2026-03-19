const mongoose = require('mongoose');

const flashcardSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    subject: {
        type: String,
        required: true
    },
    isPublic: {
        type: Boolean,
        default: false
    },
    cards: [{
        question: {
            type: String,
            required: true
        },
        answer: {
            type: String,
            required: true
        },
        difficulty: {
            type: String,
            enum: ['easy', 'medium', 'hard'],
            default: 'medium'
        },
        lastReviewed: {
            type: Date,
            default: null
        },
        masteryScore: {
            type: Number,
            default: 0 
        }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Flashcard', flashcardSchema);
