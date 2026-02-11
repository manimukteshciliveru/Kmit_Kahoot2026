
const mongoose = require('mongoose');
const Quiz = require('./models/Quiz');
const User = require('./models/User');
const dotenv = require('dotenv');
dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const quiz = await Quiz.findOne({ code: '53A971' }).populate('createdBy');
        console.log('QUIZ_DETAILS:', JSON.stringify({
            id: quiz?._id,
            createdBy: {
                id: quiz?.createdBy?._id,
                name: quiz?.createdBy?.name,
                role: quiz?.createdBy?.role
            }
        }, null, 2));
    } catch (e) {
        console.error('ERROR:', e);
    } finally {
        await mongoose.disconnect();
    }
}
check();
