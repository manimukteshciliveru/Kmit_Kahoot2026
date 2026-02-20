/**
 * REALT-TIME QUIZ INTEGRATION TEST
 * This script simulates a full quiz cycle: registration, creation, hosting, joining, and answering.
 */
const axios = require('axios');
const { io } = require('socket.io-client');

const API_URL = 'http://localhost:5000/api/v1';
const SOCKET_URL = 'http://localhost:5000';

async function runTest() {
    console.log('🚀 Starting Integration Test...');

    try {
        // 1. Register Faculty
        console.log('📝 Registering Faculty...');
        const facultyEmail = `faculty_${Date.now()}@test.com`;
        const facultyReg = await axios.post(`${API_URL}/auth/register`, {
            name: 'Test Faculty',
            email: facultyEmail,
            password: 'password123',
            role: 'faculty'
        }).catch(err => {
            console.error('Registration failed:', err.response?.data || err.message);
            throw err;
        });
        const facultyToken = facultyReg.data.data.token;
        console.log('✅ Faculty Registered.');

        // 2. Create Quiz
        console.log('➕ Creating Quiz...');
        const quizRes = await axios.post(`${API_URL}/quizzes`, {
            title: 'Integration Test Quiz',
            subject: 'Science',
            mode: 'mcq',
            settings: {
                quizTimer: 600,
                questionTimer: 30,
                shuffleQuestions: true,
                shuffleOptions: true
            },
            questions: [
                {
                    text: 'What is 2 + 2?',
                    type: 'mcq',
                    options: ['3', '4', '5', '6'],
                    correctAnswer: '4',
                    points: 10,
                    difficulty: 'easy'
                }
            ],
            accessControl: { isPublic: true }
        }, {
            headers: { Authorization: `Bearer ${facultyToken}` }
        }).catch(err => {
            console.error('Quiz creation failed:', err.response?.data || err.message);
            throw err;
        });

        let quiz = quizRes.data.data.quiz;
        const quizId = quiz._id;
        const quizCode = quiz.code;
        console.log(`✅ Quiz Created as Draft. ID: ${quizId}, PIN: ${quizCode}`);

        // 2b. Move Quiz to 'waiting' status (Host it)
        console.log('🚀 Moving Quiz to WAITING status...');
        await axios.put(`${API_URL}/quizzes/${quizId}`, {
            status: 'waiting'
        }, {
            headers: { Authorization: `Bearer ${facultyToken}` }
        }).catch(err => {
            console.error('Quiz update failed:', err.response?.data || err.message);
            throw err;
        });
        console.log('✅ Quiz is now WAITING.');

        // 3. Register Student
        console.log('📝 Registering Student...');
        const studentEmail = `student_${Date.now()}@test.com`;
        const studentReg = await axios.post(`${API_URL}/auth/register`, {
            name: 'Test Student',
            email: studentEmail,
            password: 'password123',
            role: 'student',
            rollNumber: `STU${Date.now()}`
        }).catch(err => {
            console.error('Student registration failed:', err.response?.data || err.message);
            throw err;
        });
        const studentToken = studentReg.data.data.token;
        const studentId = studentReg.data.data.user.id;
        console.log('✅ Student Registered.');

        // 4. Student Joins Quiz (REST Call)
        console.log('🚪 Student Joining via REST...');
        const joinRes = await axios.post(`${API_URL}/quizzes/join/${quizCode}`, {}, {
            headers: { Authorization: `Bearer ${studentToken}` }
        }).catch(err => {
            console.error('Student join failed:', err.response?.data || err.message);
            throw err;
        });
        console.log('✅ Student Joined (REST). Response ID:', joinRes.data.data.response._id);

        // 5. Connect Sockets
        console.log('🔌 Connecting Sockets...');
        const facultySocket = io(SOCKET_URL, { auth: { token: facultyToken } });
        const studentSocket = io(SOCKET_URL, { auth: { token: studentToken } });

        studentSocket.on('error', (err) => console.error('❌ Student Socket Error:', err));
        facultySocket.on('error', (err) => console.error('❌ Faculty Socket Error:', err));

        await new Promise((resolve, reject) => {
            let connected = 0;
            const timeout = setTimeout(() => reject(new Error('Socket timeout')), 10000);
            const check = () => {
                if (++connected === 2) {
                    clearTimeout(timeout);
                    resolve();
                }
            };
            facultySocket.on('connect', check);
            studentSocket.on('connect', check);
            facultySocket.on('connect_error', (err) => console.error('Faculty socket error:', err.message));
            studentSocket.on('connect_error', (err) => console.error('Student socket error:', err.message));
        });
        console.log('✅ Sockets Connected.');

        // 6. Join Quiz Channels
        facultySocket.emit('quiz:join', { quizId });
        studentSocket.emit('quiz:join', { quizId });

        // 7. Start Quiz (Faculty)
        console.log('🏁 Starting Quiz...');
        facultySocket.emit('quiz:start', { quizId });

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Start Quiz signal timeout')), 10000);
            studentSocket.on('quiz:state_changed', (data) => {
                console.log('📡 [STUDENT] State Changed Event:', data.status);
                if (data.status === 'question_active') {
                    console.log('✅ Quiz Started Signal Received by Student.');
                    clearTimeout(timeout);
                    resolve();
                }
            });
        });

        // 8. Submit Answer (Student)
        console.log('✍️ Submitting Answer...');
        const questionId = quiz.questions[0]._id;
        console.log(`   Q-ID: ${questionId}, Answer: "4"`);
        studentSocket.emit('answer:submit', {
            quizId,
            questionId,
            answer: '4',
            timeTaken: 2000
        });

        const feedback = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Submit Answer feedback timeout')), 10000);
            studentSocket.on('answer:feedback', (data) => {
                console.log('📡 [STUDENT] Feedback Received:', data);
                clearTimeout(timeout);
                resolve(data);
            });
        });

        if (feedback.isCorrect) {
            console.log('✅ Correct Answer Registered!');
        } else {
            throw new Error('Answer was marked incorrect but should be correct');
        }

        // 9. Faculty verifies receiving response
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Faculty response update timeout')), 10000);
            facultySocket.on('response:received', (data) => {
                console.log('📡 [FACULTY] Response Received Event:', data);
                if (data.participantId === studentId) {
                    console.log('✅ Faculty Received Student Response.');
                    clearTimeout(timeout);
                    resolve();
                }
            });
        });

        console.log('\n🌟 INTEGRATION TEST PASSED PERFECTLY! 🌟');

        facultySocket.disconnect();
        studentSocket.disconnect();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ TEST FAILED');
        console.error(error.message);
        if (error.stack) console.error(error.stack);
        process.exit(1);
    }
}

runTest();
