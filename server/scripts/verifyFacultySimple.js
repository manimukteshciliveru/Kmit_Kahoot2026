require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const verifySimple = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const faculty = await User.find({ role: 'faculty' }).select('name email');
        console.log("--- START JSON ---");
        console.log(JSON.stringify(faculty, null, 2));
        console.log("--- END JSON ---");
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

verifySimple();
