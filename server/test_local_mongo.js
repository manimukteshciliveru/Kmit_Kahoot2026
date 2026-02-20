const mongoose = require('mongoose');

async function checkLocal() {
    console.log('Checking local MongoDB...');
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/quizdb', { serverSelectionTimeoutMS: 2000 });
        console.log('✅ Connected to Local MongoDB (quizdb)');
        const count = await mongoose.connection.db.collection('users').countDocuments();
        console.log(`Local 'users' count: ${count}`);
    } catch (e) {
        console.log('❌ Could not connect to local MongoDB:', e.message);
    } finally {
        await mongoose.disconnect();
    }
}

checkLocal();
