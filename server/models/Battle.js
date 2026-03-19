const mongoose = require('mongoose');

const battleSchema = new mongoose.Schema({
    roomID: {
        type: String,
        required: true,
        unique: true
    },
    players: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: String,
        socketId: String,
        score: { type: Number, default: 0 },
        answers: [{
            questionIndex: Number,
            isCorrect: Boolean,
            timeSpent: Number
        }],
        status: { type: String, enum: ['waiting', 'playing', 'finished'], default: 'playing' }
    }],
    quizId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quiz'
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'completed', 'cancelled'],
        default: 'pending'
    },
    winner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Battle', battleSchema);
