const mongoose = require('mongoose');

const SurvivalSessionSchema = new mongoose.Schema({
    roomId:      { type: String, required: true, unique: true },
    pin:         { type: String, required: true },
    title:       { type: String, required: true },
    description: { type: String },
    host:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    hostName:    { type: String },
    topic:       { type: String },
    content:     { type: String },
    difficulty:  { type: String },
    maxPlayers:  { type: Number },
    status:      { type: String, enum: ['waiting', 'playing', 'completed', 'aborted'], default: 'waiting' },
    startedAt:   { type: Date },
    endedAt:     { type: Date },
    duration:    { type: Number },
    totalQuestions: { type: Number },
    avgAccuracy:    { type: Number },
    totalCorrectAnswers: { type: Number },

    questions: [{
        questionIndex: Number,
        questionText:  String,
        options:       [String],
        correctAnswer: String,
        explanation:   String,
        topic:         String,
        difficulty:    String,
        source:        String,
        timerGiven:    Number,
        timeEstimate:  { averageStudent: Number }
    }],

    players: [{
        userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name:           String,
        rollNumber:     String,
        department:     String,
        section:        String,
        score:          { type: Number, default: 0 },
        rank:           Number,
        survivalRounds: { type: Number, default: 0 },
        isAlive:        { type: Boolean, default: true },
        isWinner:       { type: Boolean, default: false },
        eliminatedAt:   Number,
        accuracy:       Number,
        avgTimeTaken:   Number,
        weakTopics:     [String],
        answers: [{
            questionIndex:  Number,
            questionText:   String,
            selectedAnswer: String,
            correctAnswer:  String,
            isCorrect:      Boolean,
            timeTaken:      Number,
            scoreAwarded:   Number
        }]
    }],

    winner: {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name:   String,
        score:  Number
    }
}, { timestamps: true });

module.exports = mongoose.model('SurvivalSession', SurvivalSessionSchema);
