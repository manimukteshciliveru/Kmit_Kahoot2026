/**
 * Reset/Create Admin Account
 * Usage: node scripts/resetAdmin.js
 * 
 * This script will:
 * 1. Find existing admin by employeeId '1706032' or role 'admin'
 * 2. If found, reset its password to 'admin@123$'
 * 3. If not found, create a new admin account
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const resetAdmin = async () => {
    try {
        console.log('🔄 Connecting to database...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Look for existing admin
        let admin = await User.findOne({ 
            $or: [
                { role: 'admin' },
                { employeeId: '1706032' },
                { email: 'admin@kmit.in' }
            ]
        }).select('+password');

        const newPassword = 'admin@123$';
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        if (admin) {
            console.log(`📌 Found existing admin: ${admin.name} (${admin.email})`);
            
            // Update credentials
            admin.employeeId = '1706032';
            admin.email = 'admin@kmit.in';
            admin.password = hashedPassword;
            admin.role = 'admin';
            admin.isActive = true;
            admin.name = 'System Admin';
            
            // Skip the pre-save password hash since we already hashed it
            await User.updateOne(
                { _id: admin._id },
                { 
                    $set: {
                        employeeId: '1706032',
                        email: 'admin@kmit.in',
                        password: hashedPassword,
                        role: 'admin',
                        isActive: true,
                        name: 'System Admin'
                    }
                }
            );
            
            console.log('✅ Admin account updated successfully!');
        } else {
            console.log('📌 No admin found. Creating new admin account...');
            
            // Use insertOne to bypass pre-save hooks (we already hashed)
            await User.collection.insertOne({
                name: 'System Admin',
                email: 'admin@kmit.in',
                password: hashedPassword,
                role: 'admin',
                employeeId: '1706032',
                isActive: true,
                avatar: 'https://ui-avatars.com/api/?name=Admin&background=7C3AED&color=fff&size=128',
                stats: {
                    quizzesAttended: 0,
                    quizzesCreated: 0,
                    averageScore: 0,
                    totalPoints: 0,
                    bestRank: 'Bronze I'
                },
                rank: {
                    points: 0,
                    tier: 'Bronze',
                    level: 'I',
                    winStreak: 0,
                    totalWins: 0,
                    totalLosses: 0,
                    highestPoints: 0
                },
                refreshTokens: [],
                createdAt: new Date(),
                updatedAt: new Date()
            });
            
            console.log('✅ Admin account created successfully!');
        }

        console.log('\n═══════════════════════════════════════');
        console.log('  ADMIN LOGIN CREDENTIALS');
        console.log('═══════════════════════════════════════');
        console.log('  Login Tab:    Admin');
        console.log('  Username:     1706032');
        console.log('  Email:        admin@kmit.in');
        console.log('  Password:     admin@123$');
        console.log('═══════════════════════════════════════\n');

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        await mongoose.disconnect();
        process.exit(1);
    }
};

resetAdmin();
