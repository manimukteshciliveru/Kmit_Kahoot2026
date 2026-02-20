const express = require('express');
const router = express.Router();
const {
    register,
    login,
    getMe,
    updateProfile,
    changePassword,
    refreshToken,
    logout
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
    register: registerSchema,
    login: loginSchema,
    updateProfile: updateProfileSchema
} = require('../validations/auth.validation');
const { upload } = require('../utils/cloudinary');

// Public routes
router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/refresh', refreshToken);

// Protected routes
router.get('/me', protect, getMe);
router.put('/profile', protect, upload.single('avatar'), validate(updateProfileSchema), updateProfile);
router.put('/change-password', protect, changePassword);
router.post('/logout', protect, logout);

module.exports = router;
