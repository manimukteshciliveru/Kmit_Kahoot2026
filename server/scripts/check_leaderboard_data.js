const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Load models to ensure schemas are registered
const User = require('../models/User');
const Quiz = require('../models/Quiz');
const Response = require('../models/Response');

const checkLeaderboard = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        // 1. Get recent responses to find an active quiz ID
        console.log('\n--- Recent Responses ---');
        const recentResponses = await Response.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        if (recentResponses.length === 0) {
            console.log('No responses found in DB.');
            process.exit(0);
        }

        recentResponses.forEach((r, i) => {
            console.log(`${i + 1}. ID: ${r._id}, QuizID: ${r.quizId}, UserID: ${r.userId}, Status: ${r.status}, Score: ${r.totalScore}`);
        });

        // 2. Pick the first quiz ID to check leaderboard
        const targetQuizId = recentResponses[0].quizId;
        console.log(`\n--- Checking Leaderboard for Quiz: ${targetQuizId} ---`);

        // Check raw count
        const totalCount = await Response.countDocuments({ quizId: targetQuizId });
        console.log(`Total responses for this quiz (any status): ${totalCount}`);

        // Check leaderboard query (status filter)
        const leaderboardQuery = {
            quizId: targetQuizId,
            status: { $in: ['in-progress', 'completed'] }
        };
        const validLeaderboardEntries = await Response.find(leaderboardQuery).lean();
        console.log(`Leaderboard entries (status 'in-progress' or 'completed'): ${validLeaderboardEntries.length}`);

        if (validLeaderboardEntries.length === 0) {
            console.log('\n⚠️  ZERO entries found for leaderboard!');
            console.log('Valid statuses are: in-progress, completed');

            // Analyze existing statuses
            const allStatuses = await Response.find({ quizId: targetQuizId }).select('status').lean();
            const statusMap = {};
            allStatuses.forEach(s => {
                statusMap[s.status] = (statusMap[s.status] || 0) + 1;
            });
            console.log('Actual statuses found in DB for this quiz:', statusMap);
        } else {
            console.log('\n✅ Leaderboard has data. Showing top 3:');
            const top3 = await Response.find(leaderboardQuery)
                .populate('userId', 'name rollNumber')
                .sort({ totalScore: -1 })
                .limit(3)
                .lean();

            top3.forEach((entry, i) => {
                const userName = entry.userId ? entry.userId.name : 'Unknown User (Populate Failed)';
                console.log(`#${i + 1}: ${userName} - ${entry.totalScore} pts`);
            });
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

checkLeaderboard();
