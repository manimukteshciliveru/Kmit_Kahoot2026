require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

const testImport = async () => {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        console.log('🗑️  Removing existing students...');
        const deleteResult = await User.deleteMany({ role: 'student' });
        console.log(`✅ Removed ${deleteResult.deletedCount} students`);

        console.log('📝 Creating test student...');
        const hashedPassword = await bcrypt.hash('24BD1A050Z', 10);

        const testStudent = await User.create({
            name: 'MAISE SUSHAANTH KUMAR',
            email: '24bd1a050z@student.edu',
            password: hashedPassword,
            role: 'student',
            rollNumber: '24BD1A050Z',
            section: 'CSE-A',
            isActive: true
        });

        console.log('✅ Test student created successfully!');
        console.log('Student details:', {
            name: testStudent.name,
            email: testStudent.email,
            rollNumber: testStudent.rollNumber,
            section: testStudent.section
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    }
};

testImport();
