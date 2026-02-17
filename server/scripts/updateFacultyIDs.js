const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const updateFaculty = async () => {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected');

        // Find all faculty users
        const faculties = await User.find({ role: 'faculty' }).sort({ createdAt: 1 });
        console.log(`Found ${faculties.length} faculty members.`);

        let updatedCount = 0;
        const results = [];

        for (let i = 0; i < faculties.length; i++) {
            const faculty = faculties[i];
            const facultyID = `FAC${(i + 1).toString().padStart(2, '0')}`;
            const defaultPass = `kmit@${facultyID}`;

            // We use .password = defaultPass and then .save() 
            // The User model's pre-save hook will hash it automatically.
            faculty.employeeId = facultyID;
            faculty.password = defaultPass;

            await faculty.save();

            results.push({
                Name: faculty.name,
                "New Employee ID": facultyID,
                "Default Password": defaultPass
            });
            updatedCount++;
        }

        console.log(`\n✅ Successfully updated ${updatedCount} faculty members.`);
        console.log('\n🔐 Updated Faculty Credentials:');
        console.table(results);

        process.exit(0);
    } catch (err) {
        console.error('❌ Error updating faculty:', err);
        process.exit(1);
    }
};

updateFaculty();
