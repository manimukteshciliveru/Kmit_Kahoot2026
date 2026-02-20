require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const checkUser = async () => {
    // 1. Force the use of the .env file
    const uri = process.env.MONGODB_URI;
    console.log('\n---------------------------------------------------');
    console.log('🔍 DEBUG: Checking Connection to MongoDB Atlas');
    console.log('---------------------------------------------------');
    console.log(`1️⃣  URI from .env: ${uri.substring(0, 25)}... (hidden for security)`);

    if (uri.includes('mongo1') || uri.includes('localhost') || uri.includes('127.0.0.1')) {
        console.warn('⚠️  WARNING: You seem to be using a LOCAL/DOCKER address, NOT Atlas!');
    } else {
        console.log('✅  Target appears to be MongoDB Atlas (Cloud)');
    }

    try {
        console.log('2️⃣  Attempting to connect...');
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
        console.log('✅  Connection SUCCESSFUL!');
    } catch (err) {
        console.error('\n❌  CONNECTION FAILED!');
        console.error(`   Error: ${err.message}`);
        console.error('\n⚠️  POSSIBLE CAUSE: IP Whitelist');
        console.error('   Your current IP address might not be allowed in MongoDB Atlas.');
        console.error('   Go to Atlas -> Network Access -> Add IP Address -> Allow Access from Anywhere (0.0.0.0/0)');
        process.exit(1);
    }

    const testRollNumber = '24BD1A058K';
    console.log(`\n3️⃣  Searching for User: ${testRollNumber}`);

    // Search by rollNumber OR email
    const user = await User.findOne({
        $or: [
            { rollNumber: testRollNumber },
            { email: testRollNumber },
            { email: new RegExp(`^${testRollNumber}`, 'i') }
        ]
    }).select('+password'); // Include password field to check if it exists

    if (user) {
        console.log(`✅  USER FOUND!`);
        console.log(`   - ID: ${user._id}`);
        console.log(`   - Email: ${user.email}`);
        console.log(`   - Role: ${user.role}`);
        console.log(`   - Has Password? ${user.password ? 'YES' : 'NO'}`);
    } else {
        console.log(`❌  USER NOT FOUND.`);
        console.log(`   The user '${testRollNumber}' does not exist in this database.`);
        console.log(`   Action: You need to Register this user again or Import data.`);
    }

    console.log('---------------------------------------------------\n');
    process.exit(0);
};

checkUser();
