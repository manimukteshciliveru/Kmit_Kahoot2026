
const mongoose = require('mongoose');
const Quiz = require('./models/Quiz');
const dotenv = require('dotenv');
dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const quiz = await Quiz.findOne({ code: '53A971' });
        console.log('QUIZ_FOUND:', !!quiz);
        if (quiz) {
            console.log('QUIZ_DETAILS:', {
                id: quiz._id,
                title: quiz.title,
                status: quiz.status,
                questionsCount: quiz.questions?.length || 0,
                participantsCount: quiz.participants?.length || 0
            });
        }
    } catch (e) {
        console.error('ERROR:', e);
    } finally {
        await mongoose.disconnect();
    }
}
check();
