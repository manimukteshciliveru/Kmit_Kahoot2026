const http = require('http');

function request(options, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function testQuiz() {
    console.log('Testing Quiz Creation...');

    // 1. Login
    const loginData = { email: 'faculty@demo.com', password: 'demo123' };
    const loginOpts = {
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    };

    try {
        const loginRes = await request(loginOpts, loginData);
        if (loginRes.status !== 200) {
            console.error('Login failed:', JSON.stringify(loginRes.data, null, 2));
            return;
        }

        const token = loginRes.data.data.token;
        console.log('Login success! Token obtained.');

        // 2. Create Quiz
        const quizData = {
            title: 'Test Quiz Auto',
            description: 'Test description',
            mode: 'mcq',
            settings: {
                quizTimer: 600,
                questionTimer: 30,
                shuffleQuestions: true,
                shuffleOptions: true,
                showInstantFeedback: true,
                showLeaderboard: true,
                allowTabSwitch: false,
                maxTabSwitches: 0,
                difficultyLevel: 'medium',
                passingScore: 40,
                maxParticipants: 0,
                autoStart: false,
                showCorrectAnswer: true
            },
            questions: [
                {
                    text: 'Question 1',
                    type: 'mcq',
                    options: ['A', 'B', 'C', 'D'],
                    correctAnswer: 'A',
                    points: 10,
                    timeLimit: 30,
                    difficulty: 'medium',
                    explanation: 'Explanation'
                }
            ]
        };

        const createOpts = {
            hostname: 'localhost',
            port: 5000,
            path: '/api/quizzes',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        };

        const createRes = await request(createOpts, quizData);

        if (createRes.status === 201) {
            console.log('✅ Quiz Created Successfully!');
            console.log('ID:', createRes.data.data.quiz._id);
        } else {
            console.error('❌ Quiz Creation Failed:', createRes.status);
            console.error('Error:', JSON.stringify(createRes.data, null, 2));
        }

    } catch (err) {
        console.error('Script error:', err);
    }
}

testQuiz();
