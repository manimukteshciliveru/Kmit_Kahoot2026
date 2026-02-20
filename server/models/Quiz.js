const mongoose = require('mongoose');
const crypto = require('crypto');

const questionSchema = new mongoose.Schema({
    text: {
        type: String,
        required: [true, 'Question text is required'],
        trim: true
    },
    type: {
        type: String,
        enum: ['mcq', 'msq', 'fill-blank', 'qa'],
        required: true
    },
    options: [String],
    correctAnswer: {
        type: String,
        required: [true, 'Correct answer is required']
    },
    points: {
        type: Number,
        default: 10,
        min: 1,
        max: 100
    },
    timeLimit: {
        type: Number, // seconds
        default: 0,
        min: 0,
        max: 600
    },
    difficulty: {
        type: String,
        enum: ['easy', 'medium', 'hard', 'advanced'],
        default: 'medium'
    },
    explanation: {
        type: String,
        default: ''
    },
    order: {
        type: Number,
        default: 0
    }
}, { _id: true });

const quizSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Quiz title is required'],
        trim: true,
        minlength: [3, 'Title must be at least 3 characters'],
        maxlength: [100, 'Title cannot exceed 100 characters']
    },
    subject: {
        type: String,
        required: [true, 'Subject is required'],
        trim: true,
        default: 'General'
    },
    description: {
        type: String,
        trim: true,
        maxlength: [500, 'Description cannot exceed 500 characters'],
        default: ''
    },
    coverImage: {
        type: String,
        default: ''
    },
    code: {
        type: String,
        unique: true,
        uppercase: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    mode: {
        type: String,
        enum: ['mcq', 'fill-blank', 'qa', 'mixed'],
        default: 'mcq'
    },
    status: {
        type: String,
        enum: ['draft', 'scheduled', 'active', 'paused', 'completed', 'finished'],
        default: 'draft'
    },
    settings: {
        quizTimer: {
            type: Number, // total quiz time in seconds, 0 = no limit
            default: 0
        },
        questionTimer: {
            type: Number, // per question time in seconds
            default: 30
        },
        shuffleQuestions: {
            type: Boolean,
            default: true
        },
        shuffleOptions: {
            type: Boolean,
            default: true
        },
        showInstantFeedback: {
            type: Boolean,
            default: true
        },
        showCorrectAnswer: {
            type: Boolean,
            default: true
        },
        allowTabSwitch: {
            type: Boolean,
            default: false
        },
        maxTabSwitches: {
            type: Number,
            default: 0 // 0 = terminate immediately
        },
        difficultyLevel: {
            type: String,
            enum: ['easy', 'medium', 'hard', 'advanced', 'mixed'],
            default: 'medium'
        },
        passingScore: {
            type: Number,
            default: 40 // percentage
        },
        maxParticipants: {
            type: Number,
            default: 0 // 0 = unlimited
        },
        autoStart: {
            type: Boolean,
            default: false
        },
        showLeaderboard: {
            type: Boolean,
            default: true
        }
    },
    questions: [questionSchema],
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    currentQuestionIndex: {
        type: Number,
        default: -1
    },
    scheduledAt: {
        type: Date,
        default: null
    },
    startedAt: {
        type: Date,
        default: null
    },
    endedAt: {
        type: Date,
        default: null
    },
    expiresAt: {
        type: Date,
        default: null
    },
    sourceFile: {
        filename: String,
        fileType: String, // pdf, excel, audio, video
        uploadedAt: Date
    },
    accessControl: {
        isPublic: {
            type: Boolean,
            default: true
        },
        allowedBranches: [{
            name: { type: String, trim: true }, // e.g., 'CSE', 'CSM'
            sections: [{ type: String, trim: true }] // e.g., ['A', 'B']
        }],
        mode: {
            type: String,
            enum: ['ALL', 'SPECIFIC'],
            default: 'ALL'
        },
        allowedStudents: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }]
    }
}, {
    timestamps: true
});

// Generate unique quiz code before saving
quizSchema.pre('save', async function () {
    if (!this.code) {
        this.code = crypto.randomBytes(3).toString('hex').toUpperCase();
    }
});

// Virtual for participant count
quizSchema.virtual('participantCount').get(function () {
    return this.participants ? this.participants.length : 0;
});

// Virtual for question count
quizSchema.virtual('questionCount').get(function () {
    return this.questions ? this.questions.length : 0;
});

// Virtual for total points
quizSchema.virtual('totalPoints').get(function () {
    return this.questions ? this.questions.reduce((sum, q) => sum + q.points, 0) : 0;
});

// Method to shuffle questions for a student
quizSchema.methods.getShuffledQuestions = function (seed) {
    if (!this.settings || !this.settings.shuffleQuestions) {
        return this.questions || [];
    }

    const shuffled = [...this.questions];
    let currentIndex = shuffled.length;

    // Simple seeded shuffle using the seed (can be student ID)
    const seededRandom = (seed) => {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    };

    let seedNum = seed ? parseInt(seed.toString().replace(/\D/g, '').slice(0, 8)) : Date.now();
    if (isNaN(seedNum)) seedNum = Date.now();

    while (currentIndex !== 0) {
        const randomIndex = Math.floor(seededRandom(seedNum++) * currentIndex);
        currentIndex--;
        [shuffled[currentIndex], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[currentIndex]];
    }

    return shuffled;
};

// Indexes
quizSchema.index({ code: 1 });
quizSchema.index({ status: 1 });
quizSchema.index({ createdBy: 1 });
quizSchema.index({ 'settings.difficultyLevel': 1 });

// Enable virtuals in JSON
quizSchema.set('toJSON', { virtuals: true });
quizSchema.set('toObject', { virtuals: true });

const Quiz = mongoose.model('Quiz', quizSchema);

module.exports = Quiz;
