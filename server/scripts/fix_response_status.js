const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Response = require('../models/Response');

const fixResponseStatus = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        // Update all responses that have totalScore > 0 but are 'waiting' or 'terminated' incorrectly
        // Actually, let's just make sure anything that has a completedAt date is marked as completed
        const result = await Response.updateMany(
            {
                completedAt: { $ne: null },
                status: { $ne: 'completed' }
            },
            { $set: { status: 'completed' } }
        );

        console.log(`Updated ${result.modifiedCount} responses to 'completed'.`);

        // Also check for responses with status 'in-progress' that have all answers
        // ... (skipping for now)

    } catch (error) {
        console.error('Fix failed:', error);
    } finally {
        await mongoose.disconnect();
    }
};

fixResponseStatus();
