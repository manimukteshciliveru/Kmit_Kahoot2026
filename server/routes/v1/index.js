const express = require('express');
const router = express.Router();

// Import all v1 routes
const authRoutes = require('../auth');
const quizRoutes = require('../quiz');
const responseRoutes = require('../response');
const aiRoutes = require('../ai');
const userRoutes = require('../user');
const adminRoutes = require('../admin');

// Mount routes
router.use('/auth', authRoutes);
router.use('/quiz', quizRoutes);
router.use('/responses', responseRoutes);
router.use('/ai', aiRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
