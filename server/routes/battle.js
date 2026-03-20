const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Battle = require('../models/Battle');
const { protect } = require('../middleware/auth');

// @desc    Get Global Rank Leaderboard
// @route   GET /api/v1/battle/leaderboard
router.get('/leaderboard', protect, async (req, res) => {
    try {
        const topPlayers = await User.find({ role: 'student' })
            .select('name avatar rank stats rollNumber')
            .sort({ 'rank.points': -1 })
            .limit(50);

        res.json({ success: true, data: topPlayers });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @desc    Get Personal Battle History
// @route   GET /api/v1/battle/history
router.get('/history', protect, async (req, res) => {
    try {
        const history = await Battle.find({
            'players.userId': req.user._id
        })
        .populate('quizId', 'title')
        .sort({ createdAt: -1 })
        .limit(20);

        res.json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
