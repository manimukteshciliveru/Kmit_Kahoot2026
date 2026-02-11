/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const aiGenerator = require('../services/aiGenerator');
const path = require('path');

const verify = async () => {
    console.log('🔍 Starting implementation verification...');

    // 1. Database Connection
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Database connection successful');
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        console.log('   Please check your MONGODB_URI in .env');
        process.exit(1);
    }

    // 2. Admin Features Check
    try {
        const User = require('../models/User');
        const adminCount = await User.countDocuments({ role: 'admin' });
        console.log(`✅ Admin Users found: ${adminCount}`);

        if (adminCount === 0) {
            console.warn('⚠️ No admin users found. You may need to run "node scripts/createDemoUsers.js"');
        }

        // Check backup logic theoretically (just requiring controller)
        const adminController = require('../controllers/adminController');
        if (adminController.getSystemHealth && adminController.createBackup) {
            console.log('✅ Admin Controller functions detected (getSystemHealth, createBackup)');
        } else {
            console.error('❌ Admin Controller functions missing');
        }

    } catch (error) {
        console.error('❌ Admin check failed:', error.message);
    }

    // 3. AI Service Verification (Gemini)
    console.log('\n🤖 Verifying AI Service (Gemini)...');
    if (!process.env.GOOGLE_AI_API_KEY) {
        console.error('❌ GOOGLE_AI_API_KEY is missing in .env');
        console.log('   Please add GOOGLE_AI_API_KEY=your_key_here to server/.env');
    } else {
        try {
            console.log('   Sending test request to Gemini...');
            // Simple text generation
            const questions = await aiGenerator.generateFromText(
                'Photosynthesis is the process by which green plants and some other organisms use sunlight to synthesize foods with the aid of chlorophyll.',
                { count: 1, type: 'mcq', difficulty: 'easy' }
            );

            if (questions && questions.length > 0) {
                console.log('✅ Gemini API is working! Generated question:', questions[0].text);
            } else {
                console.error('❌ Gemini returned no questions.');
            }
        } catch (error) {
            console.error('❌ AI Generation failed:', error.message);
            console.error('   Details: Ensure your API key is valid and has access to Gemini 1.5 Flash.');
        }
    }

    console.log('\n🏁 Verification Complete.');
    process.exit(0);
};

verify();
