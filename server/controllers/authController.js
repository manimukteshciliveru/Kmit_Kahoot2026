const User = require('../models/User');
const { generateToken, generateRefreshToken } = require('../middleware/auth');
const validator = require('validator');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// Helper to send tokens in response and cookie
const sendTokenResponse = async (user, statusCode, res) => {
    const accessToken = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Save refresh token to user
    user.refreshTokens = user.refreshTokens || [];

    // --- SECURITY: Single Session Enforcement ---
    if (user.role === 'student') {
        // For students, clear all previous sessions to strictly prevent exam split-sessions
        user.refreshTokens = [refreshToken];
    } else {
        // For faculty/admin, allow up to 5 concurrent sessions for multi-device management
        user.refreshTokens.push(refreshToken);
        if (user.refreshTokens.length > 5) user.refreshTokens.shift();
    }

    await user.save({ validateBeforeSave: false });

    const cookieOptions = {
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    };

    res.status(statusCode)
        .cookie('refreshToken', refreshToken, cookieOptions)
        .json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    avatar: user.avatar,
                    stats: user.stats
                },
                token: accessToken, // Access token returned for memory storage
                refreshToken: refreshToken // Also return in body for localStorage storage
            }
        });
};

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
        const userData = {
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password,
            role: userRole,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7C3AED&color=fff&size=128`
        };

        // Add additional fields for students
        if (userRole === 'student') {
            if (req.body.rollNumber) userData.rollNumber = req.body.rollNumber.toUpperCase();
            if (req.body.department) userData.department = req.body.department;
            if (req.body.section) userData.section = req.body.section;
        }

        const user = await User.create(userData);

        // Send response with tokens
        await sendTokenResponse(user, 201, res);
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
};

const Response = require('../models/Response');

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
    const { email, password, role } = req.body;

    // --- DEBUGGING LOGS ---
    console.log('👉 [LOGIN START] Request Body:', { email, role, password: password ? '******' : 'MISSING' });

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

        if (!role) {
            console.warn('⚠️ [LOGIN] Missing role');
            return res.status(400).json({ success: false, message: 'Please select a role' });
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

        console.log(`✅ [LOGIN] User found: ID=${user._id}, Role=${user.role}, RequestedRole=${role}`);

        // Role Validation
        if (user.role !== role) {
            console.warn(`⛔ [LOGIN] Role mismatch: User is ${user.role}, tried to login as ${role}`);
            return res.status(401).json({
                success: false,
                message: `This account is registered as a ${user.role}. Please use the correct login tab.`
            });
        }

        // --- DEFENSIVE SESSION OWNERSHIP (Anti-DoS / Exam Integrity) ---
        if (user.role === 'student') {
            const activeQuiz = await Response.findOne({
                userId: user._id,
                status: 'in-progress'
            });

            if (activeQuiz && activeQuiz.deviceFingerprint) {
                const currentFingerprint = `${req.ip}_${req.headers['user-agent']}`;

                // Only perform check if fingerprints differ
                if (activeQuiz.deviceFingerprint !== currentFingerprint) {
                    const lastActive = new Date(activeQuiz.lastActivityAt).getTime();
                    const now = Date.now();
                    const idleTimeSeconds = (now - lastActive) / 1000;

                    // If student was active within the last 2 minutes, protect their session
                    if (idleTimeSeconds < 120) {
                        const incidentData = {
                            event: 'BLOCKED_TAKEOVER',
                            ip: req.ip,
                            userAgent: req.headers['user-agent'],
                            details: `Multi-login attempt blocked while student was active.`
                        };

                        // Log to DB for permanent record
                        activeQuiz.securityIncidents.push(incidentData);
                        await activeQuiz.save();

                        // Notify Faculty Instantly via socket
                        const io = req.app.get('io');
                        if (io) {
                            io.to(`${activeQuiz.quizId.toString()}:host`).emit('security:incident', {
                                studentName: user.name,
                                rollNumber: user.rollNumber,
                                ...incidentData
                            });
                        }

                        console.warn(`🛡️ [SECURITY] Blocked login takeover for ${user.name}. Session active on another device.`);
                        return res.status(403).json({
                            success: false,
                            message: 'EXAM IN PROGRESS: This account is currently active in a quiz on another device. For security, login is blocked while the session is active. If your device crashed, please wait 2 minutes and try again.'
                        });
                    }
                }
            }
        }

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

        // Send tokens
        await sendTokenResponse(user, 200, res);

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
        const { name } = req.body;
        let { avatar } = req.body;

        if (req.file) {
            avatar = req.file.path;
        }

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

// @desc    Refresh access token
// @route   POST /api/auth/refresh
// @access  Public
exports.refreshToken = async (req, res) => {
    try {
        // Support both cookie and Authorization header for refresh token
        let refreshToken = req.cookies.refreshToken;

        // If not in cookie, check Authorization header
        if (!refreshToken && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            refreshToken = req.headers.authorization.split(' ')[1];
        }

        // Also check body as fallback
        if (!refreshToken && req.body.refreshToken) {
            refreshToken = req.body.refreshToken;
        }

        if (!refreshToken) {
            return res.status(401).json({ success: false, message: 'Refresh token not found' });
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'refresh_secret_default');

        // Find user and check if token is in their list
        const user = await User.findById(decoded.id);
        if (!user || !user.refreshTokens || !user.refreshTokens.includes(refreshToken)) {
            return res.status(401).json({ success: false, message: 'Invalid refresh token' });
        }

        // Generate new access token
        const accessToken = generateToken(user._id);

        res.status(200).json({
            success: true,
            data: {
                token: accessToken,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    avatar: user.avatar,
                    stats: user.stats
                }
            }
        });
    } catch (error) {
        logger.error('RefreshToken error:', error);
        res.status(401).json({ success: false, message: 'Invalid refresh token session' });
    }
};

// @desc    Logout user / Clear cookie
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;

        // Remove the specific refresh token from user's list
        if (refreshToken && req.user) {
            await User.findByIdAndUpdate(req.user._id, {
                $pull: { refreshTokens: refreshToken }
            });
        }

        res.status(200)
            .clearCookie('refreshToken', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            })
            .json({
                success: true,
                message: 'Logged out successfully'
            });
    } catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json({ success: false, message: 'Logout failed' });
    }
};
