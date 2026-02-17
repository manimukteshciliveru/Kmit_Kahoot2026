const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Quiz = require('../models/Quiz');
const Response = require('../models/Response');

const auditResponses = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('--- Response Audit ---');

        // 1. Find all quizzes that have responses
        const quizIdsWithResponses = await Response.distinct('quizId');
        console.log(`Found ${quizIdsWithResponses.length} quizzes with responses.`);

        for (const quizId of quizIdsWithResponses) {
            const quiz = await Quiz.findById(quizId).select('title');
            const responses = await Response.find({ quizId }).select('userId status totalScore');

            const stats = {};
            responses.forEach(r => {
                stats[r.status] = (stats[r.status] || 0) + 1;
            });

            console.log(`\nQuiz: "${quiz?.title || 'Unknown'}" (${quizId})`);
            console.log(`Total Responses: ${responses.length}`);
            console.log(`Status breakdown:`, stats);

            if (responses.length > 0) {
                const sample = responses[0];
                console.log(`Sample entry: User ${sample.userId}, Status: ${sample.status}, Score: ${sample.totalScore}`);
            }
        }

    } catch (error) {
        console.error('Audit failed:', error);
    } finally {
        await mongoose.disconnect();
    }
};

auditResponses();
