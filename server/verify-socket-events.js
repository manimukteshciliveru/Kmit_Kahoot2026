#!/usr/bin/env node
/**
 * Socket Event Verification Script
 * Verifies that all required socket events have the correct data structure
 */

const fs = require('fs');
const path = require('path');

console.log('═══════════════════════════════════════════════════════════');
console.log('   SOCKET EVENT VERIFICATION SCRIPT');
console.log('═══════════════════════════════════════════════════════════\n');

// Read files
const socketHandlerPath = path.join(__dirname, 'socket', 'socketHandler.js');
const quizControllerPath = path.join(__dirname, 'controllers', 'quizController.js');

const socketHandler = fs.readFileSync(socketHandlerPath, 'utf8');
const quizController = fs.readFileSync(quizControllerPath, 'utf8');

const checks = [];

// Check 1: quiz:joined has _id field
console.log('CHECK 1: quiz:joined event includes _id field');
if (socketHandler.includes("_id: r.userId._id")) {
    console.log('✓ PASS: _id field present in quiz:joined\n');
    checks.push(true);
} else {
    console.log('✗ FAIL: _id field missing from quiz:joined\n');
    checks.push(false);
}

// Check 2: quiz:joined has id field
console.log('CHECK 2: quiz:joined event includes id field');
if (socketHandler.includes("id: r.userId._id")) {
    console.log('✓ PASS: id field present in quiz:joined\n');
    checks.push(true);
} else {
    console.log('✗ FAIL: id field missing from quiz:joined\n');
    checks.push(false);
}

// Check 3: quiz:started has questions
console.log('CHECK 3: quiz:started event includes questions');
if (socketHandler.includes("questions: quiz.questions")) {
    console.log('✓ PASS: questions field present in quiz:started\n');
    checks.push(true);
} else {
    console.log('✗ FAIL: questions field missing from quiz:started\n');
    checks.push(false);
}

// Check 4: quiz:started has questionTimer
console.log('CHECK 4: quiz:started event includes questionTimer');
if (socketHandler.includes("questionTimer: quiz.settings.questionTimer")) {
    console.log('✓ PASS: questionTimer field present in quiz:started\n');
    checks.push(true);
} else {
    console.log('✗ FAIL: questionTimer field missing from quiz:started\n');
    checks.push(false);
}

// Check 5: quiz:question has timeLimit
console.log('CHECK 5: quiz:question event includes timeLimit');
if (socketHandler.includes("timeLimit: quiz.questions[quiz.currentQuestionIndex]?.timeLimit || quiz.settings.questionTimer")) {
    console.log('✓ PASS: timeLimit field present in quiz:question\n');
    checks.push(true);
} else {
    console.log('✗ FAIL: timeLimit field missing from quiz:question\n');
    checks.push(false);
}

// Check 6: answer:feedback has totalScore
console.log('CHECK 6: answer:feedback event includes totalScore');
if (socketHandler.includes("totalScore: response.totalScore")) {
    console.log('✓ PASS: totalScore field present in answer:feedback\n');
    checks.push(true);
} else {
    console.log('✗ FAIL: totalScore field missing from answer:feedback\n');
    checks.push(false);
}

// Check 7: quizController startQuiz emits questions
console.log('CHECK 7: quizController quiz:started includes questions');
if (quizController.includes("questions: quiz.questions,")) {
    console.log('✓ PASS: questions in quizController quiz:started\n');
    checks.push(true);
} else {
    console.log('✗ FAIL: questions missing in quizController quiz:started\n');
    checks.push(false);
}

// Check 8: HostQuiz listens to quiz:joined
const hostQuizPath = path.join(__dirname, '..', 'client', 'src', 'pages', 'faculty', 'HostQuiz.jsx');
if (fs.existsSync(hostQuizPath)) {
    const hostQuiz = fs.readFileSync(hostQuizPath, 'utf8');
    console.log('CHECK 8: HostQuiz includes quiz:joined listener');
    if (hostQuiz.includes("socket.on('quiz:joined', handleQuizJoined)")) {
        console.log('✓ PASS: quiz:joined listener in HostQuiz\n');
        checks.push(true);
    } else {
        console.log('✗ FAIL: quiz:joined listener missing from HostQuiz\n');
        checks.push(false);
    }
} else {
    console.log('CHECK 8: HostQuiz file not found (running from server dir)\n');
    checks.push(null);
}

// Summary
console.log('═══════════════════════════════════════════════════════════');
const passed = checks.filter(c => c === true).length;
const failed = checks.filter(c => c === false).length;
const skipped = checks.filter(c => c === null).length;

console.log(`RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped\n`);

if (failed === 0) {
    console.log('✓ ALL CHECKS PASSED - Socket events properly configured!');
    process.exit(0);
} else {
    console.log('✗ SOME CHECKS FAILED - Please review the issues above');
    process.exit(1);
}
