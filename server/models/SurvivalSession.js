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
    
    players: [{
        userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name:         { type: String },
        score:        { type: Number, default: 0 },
        survivalRounds: { type: Number, default: 0 },
        isAlive:      { type: Boolean, default: true },
        eliminatedAt: { type: Date }
    }],
    
    winner: {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name:   { type: String },
        score:  { type: Number }
    },

    startedAt: { type: Date },
    endedAt:   { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('SurvivalSession', SurvivalSessionSchema);
