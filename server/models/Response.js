const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
    questionId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    questionIndex: {
        type: Number,
        required: true
    },
    answer: {
        type: String,
        default: ''
    },
    isCorrect: {
        type: Boolean,
        default: false
    },
    scoreAwarded: {
        type: Number,
        default: 0
    },
    timeTaken: {
        type: Number, // milliseconds
        default: 0
    },
    answeredAt: {
        type: Date,
        default: null
    }
}, { _id: false });

const responseSchema = new mongoose.Schema({
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
    answers: [answerSchema],
    totalScore: {
        type: Number,
        default: 0
    },
    maxPossibleScore: {
        type: Number,
        default: 0
    },
    percentage: {
        type: Number,
        default: 0
    },
    correctCount: {
        type: Number,
        default: 0
    },
    wrongCount: {
        type: Number,
        default: 0
    },
    unansweredCount: {
        type: Number,
        default: 0
    },
    totalTimeTaken: {
        type: Number, // milliseconds
        default: 0
    },
    averageTimePerQuestion: {
        type: Number, // milliseconds
        default: 0
    },
    rank: {
        type: Number,
        default: null
    },
    status: {
        type: String,
        enum: ['waiting', 'in-progress', 'completed', 'terminated'],
        default: 'waiting'
    },
    terminationReason: {
        type: String,
        enum: [null, 'tab-switch', 'timeout', 'manual', 'disconnected'],
        default: null
    },
    tabSwitchCount: {
        type: Number,
        default: 0
    },
    questionOrder: [{
        type: mongoose.Schema.Types.ObjectId
    }],
    currentQuestionIndex: {
        type: Number,
        default: 0
    },
    startedAt: {
        type: Date,
        default: null
    },
    completedAt: {
        type: Date,
        default: null
    },
    lastActivityAt: {
        type: Date,
        default: null
    },
    // --- Enterprise / Anti-Cheat Fields ---
    trustScore: {
        type: Number,
        default: 100,
        min: 0,
        max: 100
    },
    focusLostCount: {
        type: Number,
        default: 0
    },
    aiFeedback: {
        type: String, // Generated summary from AI
        default: null
    }
}, {
    timestamps: true
});

// Compound index for unique quiz-user combination
responseSchema.index({ quizId: 1, userId: 1 }, { unique: true });

// Index for leaderboard queries
responseSchema.index({ quizId: 1, totalScore: -1, totalTimeTaken: 1 });

// Calculate stats before saving
responseSchema.pre('save', async function () {
    try {
        if (this.answers && this.answers.length > 0) {
            this.correctCount = this.answers.filter(a => a.isCorrect).length;
            this.wrongCount = this.answers.filter(a => !a.isCorrect && a.answer).length;
            this.unansweredCount = this.answers.filter(a => !a.answer).length;

            this.totalScore = this.answers.reduce((sum, a) => sum + (Number(a.scoreAwarded) || 0), 0);
            this.totalTimeTaken = this.answers.reduce((sum, a) => sum + (Number(a.timeTaken) || 0), 0);

            if (this.maxPossibleScore > 0) {
                this.percentage = Math.round((this.totalScore / this.maxPossibleScore) * 100);
            } else {
                this.percentage = 0;
            }

            const answeredQuestions = this.answers.filter(a => (Number(a.timeTaken) || 0) > 0).length;
            if (answeredQuestions > 0) {
                this.averageTimePerQuestion = Math.round(this.totalTimeTaken / answeredQuestions);
            } else {
                this.averageTimePerQuestion = 0;
            }
        }

        this.lastActivityAt = new Date();
    } catch (error) {
        console.error('Error in Response pre-save hook:', error);
        throw error;
    }
});

// Static method to get leaderboard for a quiz
responseSchema.statics.getLeaderboard = async function (quizId, limit = 100) {
    try {
        // Find all responses for this quiz first to see what's there
        const allResponses = await this.find({ quizId }).lean();

        const leaderboard = await this.find({
            quizId,
            status: { $in: ['waiting', 'in-progress', 'completed'] }
        })
            .populate('userId', 'name email avatar department section rollNumber')
            .sort({ totalScore: -1, totalTimeTaken: 1 })
            .limit(limit)
            .lean();

        return leaderboard;
    } catch (error) {
        console.error('Error in getLeaderboard static:', error);
        throw error;
    }
};

// Static method to calculate and update ranks using bulkWrite for efficiency
responseSchema.statics.updateRanks = async function (quizId) {
    const responses = await this.find({
        quizId,
        status: { $in: ['in-progress', 'completed'] }
    })
        .select('_id totalScore totalTimeTaken')
        .sort({ totalScore: -1, totalTimeTaken: 1 });

    if (responses.length === 0) return [];

    let currentRank = 0;
    let lastScore = null;
    let lastTime = null;
    const bulkOps = [];

    for (let i = 0; i < responses.length; i++) {
        const response = responses[i];

        // Same rank if same score and time
        if (response.totalScore !== lastScore || response.totalTimeTaken !== lastTime) {
            currentRank = i + 1;
        }

        bulkOps.push({
            updateOne: {
                filter: { _id: response._id },
                update: { $set: { rank: currentRank } }
            }
        });

        lastScore = response.totalScore;
        lastTime = response.totalTimeTaken;
    }

    if (bulkOps.length > 0) {
        await this.bulkWrite(bulkOps);
    }

    return responses;
};

const Response = mongoose.model('Response', responseSchema);

module.exports = Response;
