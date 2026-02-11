#!/usr/bin/env node

const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

const API_URL = 'http://localhost:5000/api';

let facultyToken = '';
let studentToken = '';
let facultyId = '';
let studentId = '';
let quizId = '';
let quizCode = '';

async function log(message, level = 'info') {
    const colors = {
        info: '\x1b[36m',      // Cyan
        success: '\x1b[32m',   // Green
        error: '\x1b[31m',     // Red
        warning: '\x1b[33m',   // Yellow
        reset: '\x1b[0m'
    };

    const icon = {
        info: '📍',
        success: '✅',
        error: '❌',
        warning: '⚠️',
    };

    console.log(`${colors[level]}${icon[level]} ${message}${colors.reset}`);
}

async function registerUser(name, email, role) {
    try {
        const res = await axios.post(`${API_URL}/auth/register`, {
            name,
            email,
            password: 'password123',
            role
        });

        return {
            token: res.data.data.token,
            id: res.data.data.user.id,
            role: res.data.data.user.role
        };
    } catch (error) {
        if (error.response?.status === 400 && error.response?.data?.message.includes('already registered')) {
            // Try to login instead
            try {
                const loginRes = await axios.post(`${API_URL}/auth/login`, {
                    email,
                    password: 'password123'
                });
                return {
                    token: loginRes.data.data.token,
                    id: loginRes.data.data.user.id,
                    role: loginRes.data.data.user.role
                };
            } catch (loginError) {
                throw loginError;
            }
        }
        throw error;
    }
}

async function testFlow() {
    try {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║  KAHOOT! QUIZ SYSTEM - HOST & JOIN DIAGNOSTIC TEST        ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');

        // Step 1: Register/Login Faculty
        await log('Step 1: Registering Faculty User...', 'info');
        try {
            const faculty = await registerUser(
                'Faculty' + Date.now(),
                'faculty' + Date.now() + '@test.com',
                'faculty'
            );
            facultyToken = faculty.token;
            facultyId = faculty.id;
            
            if (faculty.role !== 'faculty') {
                await log(`⚠️ Faculty has role: ${faculty.role} (expected: faculty)`, 'warning');
                await log('Note: You may need to run auto-fix-roles endpoint', 'warning');
            } else {
                await log(`Faculty registered with role: ${faculty.role}`, 'success');
            }
        } catch (error) {
            await log(`Failed to register faculty: ${error.response?.data?.message || error.message}`, 'error');
            return;
        }

        // Step 2: Create Quiz
        await log('\nStep 2: Faculty Creating Quiz...', 'info');
        try {
            const quizRes = await axios.post(`${API_URL}/quizzes`, {
                title: 'Test Quiz ' + Date.now(),
                description: 'Test quiz for diagnostic',
                mode: 'mcq',
                settings: {
                    questionTimer: 30,
                    shuffleQuestions: true,
                    shuffleOptions: true,
                    showInstantFeedback: true,
                    showLeaderboard: true
                },
                questions: [
                    {
                        text: 'What is 2+2?',
                        type: 'mcq',
                        options: ['3', '4', '5', '6'],
                        correctAnswer: '4',
                        points: 10,
                        timeLimit: 30,
                        difficulty: 'easy'
                    },
                    {
                        text: 'What is the capital of France?',
                        type: 'mcq',
                        options: ['London', 'Paris', 'Berlin', 'Rome'],
                        correctAnswer: 'Paris',
                        points: 10,
                        timeLimit: 30,
                        difficulty: 'medium'
                    }
                ]
            }, {
                headers: { Authorization: `Bearer ${facultyToken}` }
            });

            quizId = quizRes.data.data.quiz._id;
            quizCode = quizRes.data.data.quiz.code;
            await log(`Quiz created! ID: ${quizId}`, 'success');
            await log(`Quiz Code: ${quizCode}`, 'success');
        } catch (error) {
            await log(`Failed to create quiz: ${error.response?.data?.message || error.message}`, 'error');
            console.error('Error details:', error.response?.data || error.message);
            return;
        }

        // Step 3: Register Student
        await log('\nStep 3: Registering Student User...', 'info');
        try {
            const student = await registerUser(
                'Student' + Date.now(),
                'student' + Date.now() + '@test.com',
                'student'
            );
            studentToken = student.token;
            studentId = student.id;
            await log(`Student registered with role: ${student.role}`, 'success');
        } catch (error) {
            await log(`Failed to register student: ${error.response?.data?.message || error.message}`, 'error');
            return;
        }

        // Step 4: Faculty Host Quiz
        await log('\nStep 4: Faculty Hosting Quiz...', 'info');
        try {
            const hostRes = await axios.post(
                `${API_URL}/quizzes/${quizId}/start`,
                {},
                { headers: { Authorization: `Bearer ${facultyToken}` } }
            );
            await log('Quiz hosted successfully!', 'success');
        } catch (error) {
            const message = error.response?.data?.message || error.message;
            if (message.includes('not authorized')) {
                await log(`Host failed: Faculty has wrong role!`, 'error');
                await log('Solution: Run POST /api/admin/users/auto-fix-roles with admin token', 'warning');
            } else {
                await log(`Host failed: ${message}`, 'error');
            }
            console.error('Full error:', error.response?.data || error.message);
            return;
        }

        // Step 5: Student Join Quiz
        await log('\nStep 5: Student Joining Quiz...', 'info');
        try {
            const joinRes = await axios.post(
                `${API_URL}/quizzes/join/${quizCode}`,
                {},
                { headers: { Authorization: `Bearer ${studentToken}` } }
            );
            await log('Student joined successfully!', 'success');
            await log(`Response ID: ${joinRes.data.data.response._id}`, 'success');
        } catch (error) {
            const message = error.response?.data?.message || error.message;
            await log(`Join failed: ${message}`, 'error');
            
            if (error.response?.data?.details) {
                console.log('Details:', error.response.data.details);
            }
            if (error.response?.data?.error) {
                console.log('Error:', error.response.data.error);
            }
            return;
        }

        // Summary
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║                    ✅ ALL TESTS PASSED!                    ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log('\nSummary:');
        console.log(`  ✅ Faculty can register with 'faculty' role`);
        console.log(`  ✅ Faculty can create quiz`);
        console.log(`  ✅ Faculty can host quiz (start quiz)`);
        console.log(`  ✅ Student can register`);
        console.log(`  ✅ Student can join quiz by code`);
        console.log(`\nNext Steps:`);
        console.log(`  1. Test with multiple students in parallel`);
        console.log(`  2. Verify socket.io real-time updates`);
        console.log(`  3. Faculty should see both students joining`);
        console.log(`  4. Test quiz question delivery and answering\n`);

    } catch (error) {
        await log(`Unexpected error: ${error.message}`, 'error');
        console.error(error);
    } finally {
        rl.close();
    }
}

testFlow();
