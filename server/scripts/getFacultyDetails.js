require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');

const getFacultyDetails = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        console.log('Fetching faculty details...');
        const faculty = await User.find({ role: 'faculty' }).lean();

        const output = {
            total: faculty.length,
            details: faculty
        };

        const outputPath = path.join(__dirname, 'faculty_details.json');
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

        console.log(`Faculty details saved to ${outputPath}`);
        process.exit(0);
    } catch (err) {
        console.error('Error fetching faculty details:', err);
        process.exit(1);
    }
};

getFacultyDetails();
