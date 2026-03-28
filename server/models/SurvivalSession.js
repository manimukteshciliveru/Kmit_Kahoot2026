/**
 * ============================================================
 *  SurvivalSession.js  —  Mongoose Model
 *
 *  Stores complete records of every Survival Mode game:
 *    - All player outcomes (score, rank, eliminated at round)
 *    - Questions served (including AI-generated ones)
 *    - Winner info
 *    - Performance analytics per player
 *
 *  Collection: survivalsessions
 * ============================================================
 */

const mongoose = require('mongoose');

// ── Sub-schema: per-player result ─────────────────────────────
const playerResultSchema = new mongoose.Schema({
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name:     { type: String, required: true },
    rollNumber: { type: String, default: '' },
    department: { type: String, default: '' },
    section:    { type: String, default: '' },

    // Game outcome
    score:        { type: Number, default: 0 },
    rank:         { type: Number, default: 0 },
    isWinner:     { type: Boolean, default: false },
    eliminatedAt: { type: Number, default: null }, // question index when eliminated (null = survived to end)

    // Detailed per-question answers
    answers: [{
        questionIndex: Number,
        questionText:  String,
        selectedAnswer: String,
        correctAnswer:  String,
        isCorrect:     Boolean,
        timeTaken:     Number, // ms
        scoreAwarded:  Number
    }],

    // Analytics
    accuracy:        { type: Number, default: 0 },   // percentage
    avgTimeTaken:    { type: Number, default: 0 },   // ms average
    survivalRounds:  { type: Number, default: 0 },   // how many rounds survived
    wrongStreak:     { type: Number, default: 0 },   // max consecutive wrong answers
    correctStreak:   { type: Number, default: 0 },   // max consecutive correct answers

    // Weak topics (derived from wrong answers)
    weakTopics: [{ type: String }]
}, { _id: false });

// ── Sub-schema: each question served during session ───────────
const sessionQuestionSchema = new mongoose.Schema({
    questionIndex:  { type: Number },
    questionText:   { type: String },
    options:        [String],
    correctAnswer:  { type: String },
    explanation:    { type: String, default: '' },
    topic:          { type: String, default: 'General' },
    difficulty:     { type: String, enum: ['easy', 'medium', 'hard', 'advanced'], default: 'medium' },
    source:         { type: String, enum: ['ai', 'db', 'fallback'], default: 'ai' },

    // Time data
    timerGiven:     { type: Number, default: 20 },   // seconds
    timeEstimate: {
        averageStudent:      { type: Number, default: 15 },
        belowAverageStudent: { type: Number, default: 25 }
    }
}, { _id: false });

// ── Main SurvivalSession Schema ───────────────────────────────
const survivalSessionSchema = new mongoose.Schema({
    roomId:    { type: String, required: true, index: true },
    quizId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', default: null },

    // Game configuration
    topic:      { type: String, default: 'General' },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard', 'advanced', 'mixed'], default: 'mixed' },
    totalQuestions: { type: Number, default: 0 },

    // Questions served during this session
    questions: [sessionQuestionSchema],

    // Player results (all participants)
    players: [playerResultSchema],

    // Winner info (denormalized for fast leaderboard queries)
    winner: {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        name:   { type: String, default: '' }
    },

    // Session metadata
    startedAt:  { type: Date, default: null },
    endedAt:    { type: Date, default: null },
    duration:   { type: Number, default: 0 }, // seconds

    // Aggregate stats
    totalCorrectAnswers: { type: Number, default: 0 },
    avgAccuracy:         { type: Number, default: 0 }, // across all players

    status: {
        type: String,
        enum: ['active', 'completed', 'abandoned'],
        default: 'active'
    }
}, {
    timestamps: true,
    collection: 'survivalsessions'
});

// ── Indexes ───────────────────────────────────────────────────
survivalSessionSchema.index({ 'winner.userId': 1 });
survivalSessionSchema.index({ createdAt: -1 });
survivalSessionSchema.index({ topic: 1, difficulty: 1 });

// ── Virtual: duration in minutes ─────────────────────────────
survivalSessionSchema.virtual('durationMinutes').get(function () {
    return this.duration ? Math.round(this.duration / 60) : 0;
});

survivalSessionSchema.set('toJSON', { virtuals: true });
survivalSessionSchema.set('toObject', { virtuals: true });

const SurvivalSession = mongoose.model('SurvivalSession', survivalSessionSchema);

module.exports = SurvivalSession;
