const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const validator = require('validator');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide name, email and password'
            });
        }

        if (!validator.isEmail(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid email'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters'
            });
        }

        // Check if user exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }

        // Validate role - only allow student and faculty to self-register
        const allowedRoles = ['student', 'faculty'];
        const userRole = role && allowedRoles.includes(role) ? role : 'student';

        // Create user
        const user = await User.create({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password,
            role: userRole,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7C3AED&color=fff&size=128`
        });

        // Generate token
        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    avatar: user.avatar,
                    stats: user.stats
                },
                token
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
};

const logger = require('../utils/logger');

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
    const { email, password } = req.body;

    // --- DEBUGGING LOGS ---
    console.log('👉 [LOGIN START] Request Body:', { email, password: password ? '******' : 'MISSING' });

    try {
        // 2. Critical Environment Check
        if (!process.env.JWT_SECRET) {
            console.error('❌ [LOGIN CRASH] JWT_SECRET is missing!');
            return res.status(500).json({ success: false, message: 'Server configuration error. Please contact admin.' });
        }

        // 3. Input Validation
        if (!email || !password) {
            console.warn('⚠️ [LOGIN] Missing credentials');
            return res.status(400).json({ success: false, message: 'Please provide email/roll number and password' });
        }

        // 4. Database User Lookup
        const normalizeInput = email.trim();
        const userQuery = {
            $or: [
                { email: normalizeInput.toLowerCase() },
                { rollNumber: normalizeInput.toUpperCase() },
                { employeeId: normalizeInput.toUpperCase() },
                { employeeId: normalizeInput }
            ]
        };

        console.log(`🔍 [LOGIN] Searching for user: ${normalizeInput}`);
        const user = await User.findOne(userQuery).select('+password');

        if (!user) {
            console.warn(`⚠️ [LOGIN] User not found: ${normalizeInput}`);
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        console.log(`✅ [LOGIN] User found: ID=${user._id}, Role=${user.role}`);

        // 5. Account Status Check
        if (!user.isActive) {
            console.warn(`⛔ [LOGIN] User inactive: ${user._id}`);
            return res.status(401).json({ success: false, message: 'Account has been deactivated. Please contact admin.' });
        }

        // 6. Password Comparison
        console.log('🔐 [LOGIN] Verifying password...');
        let isMatch = false;
        try {
            isMatch = await user.comparePassword(password);
            console.log(`🔐 [LOGIN] Password match result: ${isMatch}`);
        } catch (bcryptError) {
            console.error('❌ [LOGIN] Bcrypt Error:', bcryptError);
            return res.status(500).json({ success: false, message: 'Authentication service error' });
        }

        if (!isMatch) {
            console.warn('⚠️ [LOGIN] Password incorrect');
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        logger.info(`[LOGIN SUCCESS] User: ${user._id}`);

        // 7. Update Last Login (Non-blocking)
        User.updateOne({ _id: user._id }, { lastLogin: new Date() }).catch(err =>
            logger.error(`[LOGIN WARNING] Update lastLogin failed: ${user._id}`, err)
        );

        // 8. Generate Token
        const token = generateToken(user._id);

        if (!token) {
            throw new Error('Token generation failed');
        }

        // 9. Send Response
        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    rollNumber: user.rollNumber,
                    department: user.department,
                    section: user.section,
                    avatar: user.avatar,
                    stats: user.stats
                },
                token
            }
        });

    } catch (error) {
        console.error("LOGIN ERROR:", error);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        res.status(200).json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    rollNumber: user.rollNumber,
                    department: user.department,
                    section: user.section,
                    avatar: user.avatar,
                    stats: user.stats,
                    isActive: user.isActive,
                    createdAt: user.createdAt,
                    lastLogin: user.lastLogin
                }
            }
        });
    } catch (error) {
        console.error('GetMe error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user data',
            error: error.message
        });
    }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = async (req, res) => {
    try {
        const { name, avatar } = req.body;

        const updates = {};
        if (name) updates.name = name.trim();
        if (avatar) updates.avatar = avatar;

        const user = await User.findByIdAndUpdate(
            req.user._id,
            updates,
            { new: true, runValidators: true }
        );

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    rollNumber: user.rollNumber,
                    department: user.department,
                    section: user.section,
                    avatar: user.avatar,
                    stats: user.stats
                }
            }
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile',
            error: error.message
        });
    }
};

// @desc    Change password
// @route   PUT /api/auth/password
// @access  Private
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Please provide current and new password'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters'
            });
        }

        const user = await User.findById(req.user._id).select('+password');

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        user.password = newPassword;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to change password',
            error: error.message
        });
    }
};
