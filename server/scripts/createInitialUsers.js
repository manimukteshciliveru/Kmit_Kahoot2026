require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const createMissingUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const adminExists = await User.findOne({ role: 'admin' });
        if (!adminExists) {
            console.log('Creating Admin account...');
            await User.create({
                name: 'Admin',
                email: 'admin@demo.com',
                password: 'adminpassword',
                role: 'admin'
            });
            console.log('✅ Admin account created: admin@demo.com / adminpassword');
        }

        const facultyExists = await User.findOne({ role: 'faculty' });
        if (!facultyExists) {
            console.log('Creating Faculty account...');
            await User.create({
                name: 'Faculty User',
                email: 'faculty@demo.com',
                password: 'facultypassword',
                role: 'faculty'
            });
            console.log('✅ Faculty account created: faculty@demo.com / facultypassword');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

createMissingUsers();
