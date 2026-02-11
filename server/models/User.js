const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        minlength: [2, 'Name must be at least 2 characters'],
        maxlength: [50, 'Name cannot exceed 50 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false
    },
    role: {
        type: String,
        enum: ['student', 'faculty', 'admin'],
        default: 'student'
    },
    avatar: {
        type: String,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },

    // Student-specific fields
    studentId: {
        type: String,
        trim: true,
        sparse: true
    },
    department: {
        type: String,
        trim: true
    },
    year: {
        type: String,
        trim: true
    },
    section: {
        type: String,
        trim: true
    },
    phone: {
        type: String,
        trim: true
    },

    // Faculty-specific fields
    employeeId: {
        type: String,
        trim: true,
        sparse: true
    },
    designation: {
        type: String,
        trim: true
    },
    subjects: {
        type: String,
        trim: true
    },

    stats: {
        quizzesAttended: { type: Number, default: 0 },
        quizzesCreated: { type: Number, default: 0 },
        averageScore: { type: Number, default: 0 },
        totalPoints: { type: Number, default: 0 },
        bestRank: { type: Number, default: null }
    },
    lastLogin: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;

    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
        console.error('Error hashing password:', error);
        throw error;
    }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Generate avatar URL based on name
userSchema.methods.generateAvatar = function () {
    const initials = this.name.split(' ').map(n => n[0]).join('').toUpperCase();
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(this.name)}&background=7C3AED&color=fff&size=128`;
};

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;
