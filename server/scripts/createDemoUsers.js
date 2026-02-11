const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function createUsers() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Drop any existing demo users directly
        const db = mongoose.connection.db;
        const usersCollection = db.collection('users');

        await usersCollection.deleteMany({
            email: { $in: ['student@demo.com', 'faculty@demo.com', 'admin@demo.com'] }
        });
        console.log('Cleaned up existing demo users');

        // Create users with pre-hashed passwords
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash('demo123', salt);

        const users = [
            {
                name: 'Demo Student',
                email: 'student@demo.com',
                password: hashedPassword,
                role: 'student',
                isActive: true,
                avatar: 'https://ui-avatars.com/api/?name=Demo+Student&background=7C3AED&color=fff',
                stats: { quizzesAttended: 0, quizzesCreated: 0, averageScore: 0, totalPoints: 0 },
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                name: 'Demo Faculty',
                email: 'faculty@demo.com',
                password: hashedPassword,
                role: 'faculty',
                isActive: true,
                avatar: 'https://ui-avatars.com/api/?name=Demo+Faculty&background=7C3AED&color=fff',
                stats: { quizzesAttended: 0, quizzesCreated: 0, averageScore: 0, totalPoints: 0 },
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                name: 'Demo Admin',
                email: 'admin@demo.com',
                password: hashedPassword,
                role: 'admin',
                isActive: true,
                avatar: 'https://ui-avatars.com/api/?name=Demo+Admin&background=7C3AED&color=fff',
                stats: { quizzesAttended: 0, quizzesCreated: 0, averageScore: 0, totalPoints: 0 },
                createdAt: new Date(),
                updatedAt: new Date()
            }
        ];

        const result = await usersCollection.insertMany(users);
        console.log('Created', result.insertedCount, 'demo users');

        // Verify login works
        const testUser = await usersCollection.findOne({ email: 'faculty@demo.com' });
        const isValid = await bcrypt.compare('demo123', testUser.password);
        console.log('Password test:', isValid ? 'PASSED ✓' : 'FAILED ✗');

        console.log('\n=== Demo Accounts Ready ===');
        console.log('Email: student@demo.com | Password: demo123');
        console.log('Email: faculty@demo.com | Password: demo123');
        console.log('Email: admin@demo.com   | Password: demo123');

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

createUsers();
