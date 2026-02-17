require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// Read students from file
const readStudentsFromFile = () => {
    const filePath = path.join(__dirname, 'students.txt');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.trim().split('\n');

    const students = [];
    for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length === 3) {
            students.push({
                rollNo: parts[0].trim(),
                section: parts[1].trim(),
                name: parts[2].trim()
            });
        }
    }

    return students;
};

// Generate email from roll number
const generateEmail = (rollNo) => {
    return `${rollNo.toLowerCase()}@student.edu`;
};

// Default password is the roll number itself
const generatePassword = (rollNo) => {
    return rollNo;
};

const importStudents = async () => {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        console.log('📖 Reading student data from file...');
        const students = readStudentsFromFile();
        console.log(`✅ Found ${students.length} students in file`);

        console.log('🗑️  Removing existing demo students...');
        const deleteResult = await User.deleteMany({ role: 'student' });
        console.log(`✅ Removed ${deleteResult.deletedCount} existing students`);

        console.log('📝 Creating student accounts (this may take a few minutes)...');
        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        for (let i = 0; i < students.length; i++) {
            const student = students[i];
            try {
                const sectionParts = student.section.split('-');
                const department = sectionParts.length > 1 ? sectionParts[0] : '';
                const section = sectionParts.length > 1 ? sectionParts[1] : student.section;

                await User.create({
                    name: student.name,
                    email: generateEmail(student.rollNo),
                    password: generatePassword(student.rollNo),
                    role: 'student',
                    rollNumber: student.rollNo,
                    department: department,
                    section: section,
                    isActive: true
                });

                successCount++;
                if ((i + 1) % 50 === 0) {
                    console.log(`   Progress: ${i + 1}/${students.length} students processed...`);
                }
            } catch (error) {
                errorCount++;
                errors.push({
                    student: student.rollNo,
                    error: error.message
                });
            }
        }

        console.log(`\n✅ Import completed!`);
        console.log(`   Successfully imported: ${successCount} students`);
        if (errorCount > 0) {
            console.log(`   ⚠️  Failed: ${errorCount} students`);
            console.log(`\n❌ Errors encountered:`);
            errors.slice(0, 10).forEach(e => {
                console.log(`   - ${e.student}: ${e.error}`);
            });
            if (errors.length > 10) {
                console.log(`   ... and ${errors.length - 10} more errors`);
            }
        }

        console.log('\n📊 Summary by Section:');
        const sections = await User.aggregate([
            { $match: { role: 'student' } },
            { $group: { _id: '$section', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        sections.forEach(s => {
            console.log(`   ${s._id}: ${s.count} students`);
        });

        console.log('\n🔐 Login Instructions:');
        console.log('   Students can log in using either:');
        console.log('   1. Email: <rollnumber>@student.edu');
        console.log('   2. Roll Number: <rollnumber> (case-insensitive)');
        console.log('   Password: <rollnumber> (same as roll number)');
        console.log('\n   Example:');
        console.log('   - Email: 24bd1a050z@student.edu');
        console.log('   - Roll Number: 24BD1A050Z (or 24bd1a050z)');
        console.log('   - Password: 24BD1A050Z');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error importing students:');
        console.error('Error message:', error.message);
        process.exit(1);
    }
};

importStudents();
