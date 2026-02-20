const mongoose = require('mongoose');

const aiLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    provider: {
        type: String,
        enum: ['google', 'mistral', 'openai', 'fallback'],
        required: true
    },
    model: {
        type: String,
        required: true
    },
    action: {
        type: String,
        enum: ['generate_quiz', 'chat', 'analyze'],
        default: 'generate_quiz'
    },
    promptLength: {
        type: Number,
        default: 0
    },
    responseLength: {
        type: Number,
        default: 0
    },
    tokensUsed: {
        type: Number, // Estimated or actual
        default: 0
    },
    cost: {
        type: Number, // Estimated cost in USD
        default: 0
    },
    status: {
        type: String,
        enum: ['success', 'failed'],
        default: 'success'
    },
    errorMessage: String,
    metadata: {
        fileCount: Number,
        fileTypes: [String]
    }
}, {
    timestamps: true
});

// Index for cost analysis
aiLogSchema.index({ createdAt: 1 });
aiLogSchema.index({ provider: 1, status: 1 });

const AILog = mongoose.model('AILog', aiLogSchema);

module.exports = AILog;
