const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config({ path: '../.env' });

async function fixUserRoles() {
    try {
        console.log('🔧 Fixing user roles...');
        
        // Connect to database
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kahoot', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ MongoDB connected');

        // Get all users
        const users = await User.find({});
        console.log(`\n📋 Found ${users.length} users\n`);

        // Display all users with their current roles
        console.log('Current User Roles:');
        console.log('─'.repeat(80));
        users.forEach((user, index) => {
            console.log(`${index + 1}. ${user.name} (${user.email}) - Role: ${user.role}`);
        });
        console.log('─'.repeat(80));

        // Check if there are users with quizzes created that have 'student' role
        console.log('\n🔍 Checking for inconsistencies...');
        
        const createdByStudents = await User.find({
            role: 'student',
            'stats.quizzesCreated': { $gt: 0 }
        });

        if (createdByStudents.length > 0) {
            console.log(`⚠️  Found ${createdByStudents.length} student(s) who created quizzes:\n`);
            
            for (const user of createdByStudents) {
                console.log(`   Converting "${user.name}" from 'student' to 'faculty'`);
                await User.findByIdAndUpdate(user._id, { role: 'faculty' });
            }
            console.log('\n✅ Fixed quiz creators\n');
        }

        // List all users again
        const updatedUsers = await User.find({});
        console.log('Updated User Roles:');
        console.log('─'.repeat(80));
        updatedUsers.forEach((user, index) => {
            const badge = user.role === 'faculty' && user.stats.quizzesCreated > 0 ? ' ⭐ (fixed)' : '';
            console.log(`${index + 1}. ${user.name} (${user.email}) - Role: ${user.role}${badge}`);
        });
        console.log('─'.repeat(80));

        // Summary
        const facultyCount = updatedUsers.filter(u => u.role === 'faculty').length;
        const studentCount = updatedUsers.filter(u => u.role === 'student').length;
        const adminCount = updatedUsers.filter(u => u.role === 'admin').length;

        console.log(`\n📊 Summary:`);
        console.log(`   👨‍🏫 Faculty: ${facultyCount}`);
        console.log(`   👨‍🎓 Students: ${studentCount}`);
        console.log(`   👑 Admins: ${adminCount}`);

        console.log('\n✅ User role fixing completed!');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

fixUserRoles();
