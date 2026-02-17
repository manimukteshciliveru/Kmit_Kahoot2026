require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const checkStudents = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const studentCount = await User.countDocuments({ role: 'student' });
        console.log(`\n📊 Total students in database: ${studentCount}\n`);

        const sections = await User.aggregate([
            { $match: { role: 'student' } },
            { $group: { _id: '$section', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        console.log('📋 Students by section:');
        let total = 0;
        sections.forEach(s => {
            console.log(`   ${s._id}: ${s.count} students`);
            total += s.count;
        });
        console.log(`\n   TOTAL: ${total} students`);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
};

checkStudents();
