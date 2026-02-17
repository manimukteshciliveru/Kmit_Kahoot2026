const mongoose = require('mongoose');
const Response = require('../models/Response');
const User = require('../models/User'); // Required for population
require('dotenv').config();

const debugLeaderboard = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Find the most recent response to get a valid quizId
        const recentResponse = await Response.findOne().sort({ createdAt: -1 });

        if (!recentResponse) {
            console.log('No responses found in the database.');
            return;
        }

        const quizId = recentResponse.quizId;
        console.log(`\nAnalyzing Quiz ID: ${quizId}`);
        console.log('--------------------------------------------------');

        // 2. Count total responses for this quiz
        const totalResponses = await Response.countDocuments({ quizId });
        console.log(`Total responses for this quiz: ${totalResponses}`);

        // 3. Check statuses of these responses
        const statusCounts = await Response.aggregate([
            { $match: { quizId: quizId } },
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);
        console.log('Response Status Counts:', statusCounts);

        // 4. Run the actual getLeaderboard query logic manually
        const leaderboardQuery = {
            quizId,
            status: { $in: ['in-progress', 'completed'] }
        };

        console.log('\nQuerying with filter:', JSON.stringify(leaderboardQuery));

        const leaderboard = await Response.find(leaderboardQuery)
            .populate('userId', 'name email rollNumber')
            .sort({ totalScore: -1, totalTimeTaken: 1 })
            .limit(5)
            .lean();

        console.log(`\nLeaderboard returns ${leaderboard.length} entries.`);

        if (leaderboard.length === 0) {
            console.log('⚠️  Leaderboard is empty!');
            // Check if there are any responses at all for this quiz, ignoring status
            const allQuizResponses = await Response.find({ quizId }).limit(5);
            if (allQuizResponses.length > 0) {
                console.log('\nSample of raw responses (ignoring status filter):');
                allQuizResponses.forEach(r => {
                    console.log(`- User: ${r.userId}, Status: "${r.status}", Score: ${r.totalScore}`);
                });
                console.log('\nPOSSIBLE CAUSE: Status mismatch. The API expects "in-progress" or "completed".');
            }
        } else {
            console.log('Top 5 Entries:');
            leaderboard.forEach((entry, idx) => {
                console.log(`#${idx + 1}: ${entry.userId?.name} (${entry.userId?.rollNumber}) - Score: ${entry.totalScore}, Status: ${entry.status}`);
            });
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

debugLeaderboard();
