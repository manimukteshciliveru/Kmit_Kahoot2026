require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const verifyChanges = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        console.log('--- Current Faculty List (After Updates) ---');
        const faculty = await User.find({ role: 'faculty' }).select('name email');
        console.table(faculty.map(f => ({ Name: f.name, Email: f.email })));

        console.log('\n--- Checking for Deleted Demo Accounts ---');
        const demoFaculty = await User.findOne({ email: 'faculty@demo.com' });
        const demoStudent = await User.findOne({ email: 'student@demo.com' });

        console.table([
            { Account: 'faculty@demo.com', Status: demoFaculty ? 'EXISTS (Failed)' : 'DELETED (Success)' },
            { Account: 'student@demo.com', Status: demoStudent ? 'EXISTS (Failed)' : 'DELETED (Success)' }
        ]);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

verifyChanges();
