const mongoose = require('mongoose');

const quizResultSchema = new mongoose.Schema({
    quizId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quiz',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    rollNumber: String,
    studentName: String,
    totalScore: {
        type: Number,
        default: 0
    },
    correctCount: {
        type: Number,
        default: 0
    },
    incorrectCount: {
        type: Number,
        default: 0
    },
    unansweredCount: {
        type: Number,
        default: 0
    },
    percentage: {
        type: Number,
        default: 0
    },
    totalTimeTaken: {
        type: Number,
        default: 0
    },
    answers: [
        {
            questionId: mongoose.Schema.Types.ObjectId,
            selectedOption: String,
            correctOption: String,
            isCorrect: Boolean,
            scoreAwarded: Number,
            timeTaken: Number
        }
    ],
    completedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Unique index to prevent duplicate results for the same quiz attempt
quizResultSchema.index({ quizId: 1, userId: 1 }, { unique: true });

const QuizResult = mongoose.model('QuizResult', quizResultSchema);

module.exports = QuizResult;
