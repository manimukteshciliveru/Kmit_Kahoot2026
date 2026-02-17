const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

mongoose.connect(process.env.MONGODB_URI)
    .then(() => User.countDocuments({ role: 'student' }))
    .then(count => {
        console.log(`Student count: ${count}`);
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
