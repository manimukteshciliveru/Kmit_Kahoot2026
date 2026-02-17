require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const checkNonStudents = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const users = await User.find({ role: { $ne: 'student' } }).select('name email role');
        console.log('Non-student users:');
        users.forEach(u => console.log(`${u.name} (${u.email}) - ${u.role}`));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkNonStudents();
