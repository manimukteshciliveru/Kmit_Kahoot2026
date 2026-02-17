require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Quiz = require('../models/Quiz');
const Response = require('../models/Response');

const addIndexes = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        console.log('🛠️  Adding Indexes for Scalability...');

        // 1. Response Indexes
        // Active participants query: { quizId: 1, status: 1 }
        await Response.collection.createIndex({ quizId: 1, status: 1 });
        console.log('✅ Index added: Response { quizId: 1, status: 1 }');

        // Analytics query: { "answers.questionId": 1 }
        await Response.collection.createIndex({ "answers.questionId": 1 });
        console.log('✅ Index added: Response { "answers.questionId": 1 }');

        // User history: { userId: 1, createdAt: -1 }
        await Response.collection.createIndex({ userId: 1, createdAt: -1 });
        console.log('✅ Index added: Response { userId: 1, createdAt: -1 }');

        // 2. Quiz Indexes
        // Active quizzes: { status: 1, startedAt: -1 }
        await Quiz.collection.createIndex({ status: 1, startedAt: -1 });
        console.log('✅ Index added: Quiz { status: 1, startedAt: -1 }');

        // Public/Access Control
        await Quiz.collection.createIndex({ "accessControl.isPublic": 1 });
        console.log('✅ Index added: Quiz { "accessControl.isPublic": 1 }');

        console.log('🎉 Index optimization complete.');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error adding indexes:', error);
        process.exit(1);
    }
};

addIndexes();
