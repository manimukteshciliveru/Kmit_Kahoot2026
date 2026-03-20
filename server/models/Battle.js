const mongoose = require('mongoose');

const battleSchema = new mongoose.Schema({
    battleId: { type: String, required: true, unique: true },
    topic: { type: String, required: true },
    mode: { type: String, enum: ['random', 'challenge'], default: 'random' },
    status: { type: String, enum: ['waiting', 'active', 'completed', 'canceled'], default: 'active' },
    questionTimer: { type: Number, default: 20 },
    questionCount: { type: Number, default: 5 },
    
    players: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: String,
        socketId: String,
        hp: { type: Number, default: 100 },
        score: { type: Number, default: 0 },
        isWinner: { type: Boolean, default: false },
        answers: [{
            questionIndex: Number,
            isCorrect: Boolean,
            timeSpent: Number, // in ms
            perfect: Boolean, // if speed was exceptionally fast
            answeredAt: { type: Date, default: Date.now }
        }],
        afk: { type: Boolean, default: false }
    }],
    
    quiz: {
        topic: String,
        questions: [{
            questionText: String,
            options: [{ text: String, isCorrect: Boolean }],
            correctAnswer: Number, // Index of correct option
            difficulty: String
        }]
    },
    
    roomID: String,
    startedAt: { type: Date, default: Date.now },
    endedAt: Date
}, { timestamps: true });

module.exports = mongoose.model('Battle', battleSchema);
