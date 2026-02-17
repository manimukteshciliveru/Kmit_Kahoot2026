const mongoose = require('mongoose');
const User = require('../models/User');
const Quiz = require('../models/Quiz');
const Response = require('../models/Response');
require('dotenv').config({ path: '../client/.env' }); // Load env from client .env for simplicity or hardcode

const MONGO_URI = 'mongodb+srv://manimukteshciliveru_db_user:9LznajuRt9Y6ONjm@kahootcluster.1dnbkca.mongodb.net/quizmaster?retryWrites=true&w=majority&appName=KahootCluster';

const testAnalytics = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        console.log('Fetching User stats...');
        const totalUsers = await User.countDocuments();
        console.log('Total Users:', totalUsers);

        console.log('Fetching Quiz stats...');
        const totalQuizzes = await Quiz.countDocuments();
        console.log('Total Quizzes:', totalQuizzes);

        console.log('Fetching Response stats...');
        const totalResponses = await Response.countDocuments();
        console.log('Total Responses:', totalResponses);

        console.log('Fetching Recent Users...');
        const recentUsers = await User.find()
            .select('name email role createdAt')
            .sort({ createdAt: -1 })
            .limit(5);
        console.log('Recent Users:', recentUsers.length);

        console.log('Fetching Recent Quizzes...');
        const recentQuizzes = await Quiz.find()
            .populate('createdBy', 'name')
            .select('title code status createdAt')
            .sort({ createdAt: -1 })
            .limit(5);
        console.log('Recent Quizzes:', recentQuizzes.length);

        console.log('Fetching Monthly Stats...');
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const monthlyNewUsers = await User.countDocuments({
            createdAt: { $gte: monthStart }
        });
        console.log('Monthly New Users:', monthlyNewUsers);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

testAnalytics();
