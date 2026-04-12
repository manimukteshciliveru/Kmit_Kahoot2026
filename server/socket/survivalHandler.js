/**
 * ============================================================
 *  survivalHandler.js — Redesigned Survival Mode Engine v2.0
 *
 *  GAME FLOW:
 *    1. Host creates room → sets rounds (1-5), questions/round mode
 *    2. Players join room (lobby shows names only, no ranks yet)
 *    3. Host starts game → survival:start
 *
 *    FOR EACH ROUND:
 *      a. Server emits round_intro (round number, alive count, difficulty)
 *      b. For each question in round:
 *           - Server generates AI question at escalated difficulty
 *           - All alive players answer
 *           - After timer: answers locked, server ACKs
 *      c. After ALL questions in round answered:
 *           - Smart elimination: bottom X% eliminated
 *           - Round score board emitted to ALL (alive + spectating)
 *      d. Next round begins (higher difficulty, fewer questions if decremental)
 *
 *    END:
 *      - Full ranked leaderboard emitted to ALL (every participant)
 *      - session saved to MongoDB
 *
 *  DIFFICULTY ESCALATION:
 *    Round 1: easy  → Round 2: medium → Round 3: hard → Round 4: advanced → Round 5: advanced+
 *
 *  ELIMINATION PATTERN (Smart % based):
 *    - Round 1: eliminate bottom 40% (keeps many players)
 *    - Round 2: eliminate bottom 35%
 *    - Round 3: eliminate bottom 30%
 *    - Round 4: eliminate bottom 25%
 *    - Round 5+: eliminate all wrong answerers (final showdown)
 *    - Minimum: always keep at least 1 survivor unless all got it wrong
 *    - For small rooms (<5): eliminate only wrong answerers
 *
 *  SCORING:
 *    - Base score per correct answer: depends on difficulty
 *    - Speed bonus: faster answer = more bonus points (up to +50%)
 *    - Round bonus: extra points for surviving a round
 * ============================================================
 */

const Quiz            = require('../models/Quiz');
const SurvivalSession = require('../models/SurvivalSession');
const User            = require('../models/User');
const { generateAIQuestion, decideTimer, difficultyTimer, preloadNextQuestion } = require('../services/aiQuestionService');
const logger          = require('../utils/logger');

// ── In-memory survival rooms ──────────────────────────────────
let survivalRooms = new Map();
let pinToRoomId   = new Map();
survivalRooms.clear();
pinToRoomId.clear();

// ── Constants ────────────────────────────────────────────────
const DIFFICULTY_SEQUENCE = ['easy', 'medium', 'hard', 'advanced', 'advanced'];
const BASE_SCORES = { easy: 10, medium: 20, hard: 30, advanced: 40 };
const ROUND_SURVIVAL_BONUS = { 1: 5, 2: 10, 3: 20, 4: 30, 5: 50 };

// Elimination %: what fraction of alive players to remove after each round
// For large rooms this keeps the game alive longer
const ELIMINATION_RATES = [0.40, 0.35, 0.30, 0.25, 1.0]; // index = round index (0-based)

// ── Helpers ──────────────────────────────────────────────────
const roomcast = (io, roomId, event, data) => io.to(`survival:${roomId}`).emit(event, data);
const mkRoomId = () => `sv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
const mkPin = () => {
    let pin;
    do { pin = Math.floor(100000 + Math.random() * 900000).toString(); }
    while (pinToRoomId.has(pin));
    return pin;
};

/** Calculate questions per round given mode and round index */
const getQuestionsForRound = (totalRounds, questionsPerRoundMode, baseQCount, roundIdx) => {
    if (questionsPerRoundMode === 'equal') {
        return baseQCount;
    }
    // Decremental: Round 1 has most, last round has 1
    // e.g., 3 rounds → [3, 2, 1]  4 rounds → [4, 3, 2, 1]  5 rounds → [5, 4, 3, 2, 1]
    return Math.max(1, totalRounds - roundIdx);
};

/** Smart elimination: eliminate bottom X% by score this round, never eliminate everyone */
const computeEliminations = (alivePlayers, roundIdx, roomSize) => {
    const alive = Array.from(alivePlayers.values()).filter(p => p.isAlive);
    if (alive.length <= 1) return { eliminated: [], survivors: alive };

    // For small rooms (<= 5), just eliminate wrong answerers
    if (alive.length <= 5) {
        // currentRoundScores is set on each player during answer processing
        const wrong = alive.filter(p => !p.correctThisRound);
        const right = alive.filter(p => p.correctThisRound);
        // If everyone wrong, save at least one (highest scorer overall)
        if (right.length === 0) {
            alive.sort((a, b) => b.score - a.score);
            return { eliminated: alive.slice(1), survivors: [alive[0]] };
        }
        return { eliminated: wrong, survivors: right };
    }

    // Large rooms: percentage-based elimination
    // Sort by round performance: correct first, then by speed (lower timeTaken = better)
    alive.sort((a, b) => {
        if (b.correctThisRound !== a.correctThisRound) return b.correctThisRound ? 1 : -1;
        return (a.roundTimeTaken || 9999) - (b.roundTimeTaken || 9999);
    });

    const rate = ELIMINATION_RATES[Math.min(roundIdx, ELIMINATION_RATES.length - 1)];
    const eliminateCount = Math.floor(alive.length * rate);
    // At least 1 survivor always
    const safeEliminate = Math.min(eliminateCount, alive.length - 1);

    const survivors  = alive.slice(0, alive.length - safeEliminate);
    const eliminated = alive.slice(alive.length - safeEliminate);

    return { eliminated, survivors };
};

const calcScore = (isCorrect, difficulty, timeTaken, timerGiven) => {
    if (!isCorrect) return 0;
    const base = BASE_SCORES[difficulty] || 20;
    // Speed bonus: 0% to 50% extra based on how fast they answered
    const speedRatio = Math.max(0, 1 - (timeTaken / (timerGiven * 1000)));
    const speedBonus = Math.round(base * 0.5 * speedRatio);
    return base + speedBonus;
};

const calcPlayerAccuracy = (player) => {
    if (!player.answers.length) return 0;
    const correct = player.answers.filter(a => a.isCorrect).length;
    return Math.round((correct / player.answers.length) * 100);
};

const getScoreboard = (room) =>
    Array.from(room.alivePlayers.values())
        .concat(room.eliminatedPlayers || [])
        .sort((a, b) => b.score - a.score)
        .map((p, i) => ({ rank: i + 1, userId: p.userId, name: p.name, score: p.score, isAlive: p.isAlive }));

const broadcastRoomsList = (io) => {
    const openRooms = [];
    for (const [roomId, room] of survivalRooms.entries()) {
        if (room.status === 'waiting') {
            openRooms.push({
                roomId, title: room.title, description: room.description,
                hostName: room.hostName, pin: room.pin,
                topic: room.topic, difficulty: room.startDifficulty,
                playerCount: room.alivePlayers.size, maxPlayers: room.maxPlayers,
                rounds: room.totalRounds, questionsMode: room.questionsPerRoundMode
            });
        }
    }
    io.emit('survival:rooms_list', openRooms);
};

const fetchDBQuestion = async (topic, difficulty, usedTexts = []) => {
    try {
        const filter = { 'questions.difficulty': difficulty, status: { $in: ['done', 'completed', 'waiting', 'live'] } };
        if (topic && topic !== 'General') {
            filter.$or = [{ subject: { $regex: topic, $options: 'i' } }, { title: { $regex: topic, $options: 'i' } }];
        }
        const quizzes = await Quiz.find(filter).select('questions subject difficulty').lean().limit(20);
        const pool = [];
        quizzes.forEach(qz => qz.questions.forEach(q => {
            if (q.difficulty === difficulty && !usedTexts.includes(q.text) && q.options.length >= 2)
                pool.push({ ...q, topic: qz.subject || topic });
        }));
        if (!pool.length) return null;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        return { question: pick.text, options: pick.options, correctAnswer: pick.correctAnswer, explanation: pick.explanation || '', difficulty, topic: pick.topic, timer: difficultyTimer(difficulty), source: 'db' };
    } catch (err) { logger.error('[SURVIVAL] DB fallback error:', err.message); return null; }
};

// ── Main Handler ──────────────────────────────────────────────
module.exports = (io, socket) => {
    if (!socket.user) return;
    const userId   = socket.user._id.toString();
    const userName = socket.user.name;

    // ── CREATE ROOM ───────────────────────────────────────────
    socket.on('survival:create', async (data) => {
        const {
            topic           = 'General',
            startDifficulty = 'easy',
            title           = 'Survival Arena',
            description     = 'Survival Match',
            maxPlayers      = 50,
            totalRounds     = 3,
            baseQPerRound   = 3,
            questionsPerRoundMode = 'decremental', // 'decremental' | 'equal'
            quizId          = null
        } = data || {};

        const clampedRounds = Math.min(5, Math.max(1, parseInt(totalRounds) || 3));
        const clampedBase   = Math.min(5, Math.max(1, parseInt(baseQPerRound) || 3));

        const roomId = mkRoomId();
        const pin    = mkPin();

        const room = {
            roomId, pin, title, description,
            host: userId, hostName: userName,
            topic,
            content: data.content || null,
            startDifficulty,
            totalRounds: clampedRounds,
            baseQPerRound: clampedBase,
            questionsPerRoundMode,
            maxPlayers: Math.min(75, Math.max(2, parseInt(maxPlayers) || 50)),
            quizId,
            status: 'waiting',
            currentRound: 0,          // 0-based round index during game
            currentQInRound: 0,       // 0-based question index within current round
            totalQAsked: 0,           // total questions asked across all rounds
            alivePlayers: new Map(),  // userId → playerObj
            eliminatedPlayers: [],    // eliminated playerObjs (for final board)
            usedQuestions: [],
            currentQuestion: null,
            roundTimer: null,
            sessionDoc: null
        };

        survivalRooms.set(roomId, room);
        pinToRoomId.set(pin, roomId);
        socket.join(`survival:${roomId}`);

        room.alivePlayers.set(userId, {
            userId, name: userName, avatar: socket.user.avatar,
            rollNumber: socket.user.rollNumber || '',
            department: socket.user.department || '',
            section: socket.user.section || '',
            socketId: socket.id,
            score: 0, answers: [], isAlive: true, eliminatedAt: null,
            correctThisRound: false, roundTimeTaken: 9999
        });

        try {
            const sessionDoc = new SurvivalSession({
                roomId, pin, title, description,
                host: userId, hostName: userName,
                topic, difficulty: startDifficulty,
                maxPlayers: room.maxPlayers,
                status: 'waiting',
                players: [{ userId, name: userName, score: 0, isAlive: true }]
            });
            await sessionDoc.save();
            room.sessionDoc = sessionDoc;

            socket.emit('survival:created', {
                roomId, pin, topic, title, description,
                startDifficulty, totalRounds: clampedRounds,
                baseQPerRound: clampedBase, questionsPerRoundMode,
                maxPlayers: room.maxPlayers, host: userId
            });
            broadcastRoomsList(io);
            logger.info(`[SURVIVAL] Created: ${roomId} | PIN: ${pin} | Rounds: ${clampedRounds} | QMode: ${questionsPerRoundMode}`);
        } catch (err) {
            logger.error('[SURVIVAL] DB Create failed:', err.message);
            socket.emit('error', { message: 'Database failure. Please try again.' });
        }
    });

    // ── JOIN BY PIN ───────────────────────────────────────────
    socket.on('survival:join_by_pin', (data) => {
        const { pin } = data || {};
        if (!pin) return socket.emit('error', { message: 'PIN is required.' });
        const pinStr = pin.toString();
        const roomId = pinToRoomId.get(pinStr);
        if (!roomId) return socket.emit('error', { message: 'Invalid PIN. Room not found.' });
        const room = survivalRooms.get(roomId);
        if (!room) return socket.emit('error', { message: 'Room data lost or expired.' });
        if (room.status !== 'waiting') return socket.emit('error', { message: 'Match already in progress.' });
        socket.emit('survival:pin_resolved', { roomId });
        logger.info(`[SURVIVAL] PIN ${pinStr} → ${roomId}`);
    });

    // ── JOIN ROOM ─────────────────────────────────────────────
    socket.on('survival:join', (data) => {
        const { roomId } = data || {};
        const room = survivalRooms.get(roomId);
        if (!room) return socket.emit('error', { message: 'Survival room not found.' });

        const isReconnecting = room.alivePlayers.has(userId) || room.host === userId ||
            room.eliminatedPlayers.some(p => p.userId === userId);

        if (!isReconnecting && room.status !== 'waiting') {
            return socket.emit('error', { message: 'Game already in progress.' });
        }
        if (!isReconnecting && room.alivePlayers.size >= room.maxPlayers) {
            return socket.emit('error', { message: `Room is full (${room.maxPlayers} max).` });
        }

        socket.join(`survival:${roomId}`);

        if (!room.alivePlayers.has(userId) && !room.eliminatedPlayers.some(p => p.userId === userId)) {
            room.alivePlayers.set(userId, {
                userId, name: userName, avatar: socket.user.avatar,
                rollNumber: socket.user.rollNumber || '', department: socket.user.department || '', section: socket.user.section || '',
                socketId: socket.id, score: 0, answers: [], isAlive: true, eliminatedAt: null,
                correctThisRound: false, roundTimeTaken: 9999
            });
        } else if (room.alivePlayers.has(userId)) {
            room.alivePlayers.get(userId).socketId = socket.id;
        }

        const playersArr = Array.from(room.alivePlayers.values()).map(p => ({ userId: p.userId, name: p.name, avatar: p.avatar }));
        roomcast(io, roomId, 'survival:player_joined', { player: { userId, name: userName, avatar: socket.user.avatar }, players: playersArr });

        // Push to sessionDoc if new
        if (room.sessionDoc) {
            const inSession = room.sessionDoc.players.some(p => p.userId?.toString() === userId);
            if (!inSession) {
                room.sessionDoc.players.push({ userId, name: userName, score: 0, isAlive: true });
                room.sessionDoc.save().catch(e => logger.error('[SURVIVAL] Session join save:', e.message));
            }
        }

        socket.emit('survival:room_state', {
            roomId, title: room.title, description: room.description, topic: room.topic,
            startDifficulty: room.startDifficulty, totalRounds: room.totalRounds,
            baseQPerRound: room.baseQPerRound, questionsPerRoundMode: room.questionsPerRoundMode,
            players: playersArr, status: room.status, host: room.host, maxPlayers: room.maxPlayers
        });

        // Reconnect sync: push live question if in progress
        if (room.status === 'active' && room.currentQuestion) {
            const alivePlayers = Array.from(room.alivePlayers.values()).filter(p => p.isAlive);
            const qData = room.currentQuestion;
            const elapsed = Math.floor((Date.now() - qData.startedAt) / 1000);
            const remaining = Math.max(0, (qData.timer || 20) - elapsed);
            socket.emit('survival:new_question', {
                questionIndex: room.totalQAsked, questionNumber: room.currentQInRound + 1,
                totalQInRound: getQuestionsForRound(room.totalRounds, room.questionsPerRoundMode, room.baseQPerRound, room.currentRound),
                roundIndex: room.currentRound, roundNumber: room.currentRound + 1, totalRounds: room.totalRounds,
                question: qData.question, options: qData.options, difficulty: qData.difficulty,
                topic: qData.topic, timer: remaining, source: qData.source,
                aliveCount: alivePlayers.length, statusMessage: 'Mid-round re-sync...'
            });
        }

        logger.info(`[SURVIVAL] ${userName} joined room ${roomId}`);
    });

    // ── START GAME ────────────────────────────────────────────
    socket.on('survival:start', (data) => {
        const { roomId } = data || {};
        const room = survivalRooms.get(roomId);
        if (!room) return socket.emit('error', { message: 'Room not found.' });
        if (room.host !== userId) return socket.emit('error', { message: 'Only host can start.' });
        if (room.status !== 'waiting') return socket.emit('error', { message: 'Game already started.' });

        room.status    = 'active';
        room.startedAt = new Date();

        roomcast(io, roomId, 'survival:game_starting', {
            roomId,
            players: Array.from(room.alivePlayers.values()).map(p => ({ userId: p.userId, name: p.name })),
            totalRounds: room.totalRounds, baseQPerRound: room.baseQPerRound,
            questionsPerRoundMode: room.questionsPerRoundMode
        });

        // Start Round 0 after a 3s countdown
        setTimeout(() => beginRound(io, room), 3000);
        logger.info(`[SURVIVAL] Game started: ${roomId} | Players: ${room.alivePlayers.size}`);
    });

    // ── SUBMIT ANSWER ─────────────────────────────────────────
    socket.on('survival:submit_answer', (data) => {
        const { roomId, answer, questionIndex } = data || {};
        const room = survivalRooms.get(roomId);
        if (!room || room.status !== 'active') return;

        const player = room.alivePlayers.get(userId);
        if (!player) return; // eliminated players can't answer

        // Prevent double-submission
        if (player.answers.some(a => a.questionIndex === questionIndex)) return;

        const q = room.currentQuestion;
        if (!q || q.globalIndex !== questionIndex) return;

        const isCorrect  = answer && answer.trim() === q.correctAnswer.trim();
        const timeTaken  = Date.now() - q.startedAt;
        const scoreGiven = calcScore(isCorrect, q.difficulty, timeTaken, q.timer);

        const answerRecord = {
            questionIndex, questionText: q.question,
            selectedAnswer: answer || '', correctAnswer: q.correctAnswer,
            isCorrect, timeTaken, scoreAwarded: scoreGiven,
            roundIndex: room.currentRound
        };

        player.answers.push(answerRecord);
        player.score += scoreGiven;

        // Track round-level stats for elimination decision
        if (isCorrect) {
            player.correctThisRound = true;
            player.roundTimeTaken = Math.min(player.roundTimeTaken || 9999, timeTaken);
        }

        socket.emit('survival:answer_ack', {
            isCorrect, correctAnswer: q.correctAnswer, explanation: q.explanation || '',
            scoreAwarded: scoreGiven, totalScore: player.score
        });

        // Remove from pending
        if (room.pendingAnswers) {
            room.pendingAnswers.delete(userId);
            if (room.pendingAnswers.size === 0) {
                clearTimeout(room.roundTimer);
                advanceQuestion(io, room);
            }
        }

        logger.info(`[SURVIVAL] ${userName} answered Q${questionIndex} | Correct: ${isCorrect} | +${scoreGiven}pts`);
    });

    // ── LEAVE ─────────────────────────────────────────────────
    socket.on('survival:leave', (data) => {
        const { roomId } = data || {};
        const room = survivalRooms.get(roomId);
        if (!room) return;
        const player = room.alivePlayers.get(userId);
        if (player && player.isAlive) { player.isAlive = false; player.eliminatedAt = room.currentRound; }
        socket.leave(`survival:${roomId}`);
        logger.info(`[SURVIVAL] ${userName} left room ${roomId}`);
    });

    // ── GET ROOM LIST ─────────────────────────────────────────
    socket.on('survival:get_rooms', () => {
        const openRooms = [];
        for (const [roomId, room] of survivalRooms.entries()) {
            if (room.status === 'waiting') {
                openRooms.push({
                    roomId, title: room.title, description: room.description,
                    hostName: room.hostName, pin: room.pin, topic: room.topic,
                    difficulty: room.startDifficulty,
                    playerCount: room.alivePlayers.size, maxPlayers: room.maxPlayers,
                    rounds: room.totalRounds, questionsMode: room.questionsPerRoundMode
                });
            }
        }
        socket.emit('survival:rooms_list', openRooms);
    });
};

// ═══════════════════════════════════════════════════════════════
//  INTERNAL GAME ENGINE
// ═══════════════════════════════════════════════════════════════

/** Begins a new round: broadcasts round_intro, resets per-round tracking, starts Q1 */
const beginRound = (io, room) => {
    const { roomId, currentRound, totalRounds } = room;
    const difficulty = DIFFICULTY_SEQUENCE[Math.min(currentRound, DIFFICULTY_SEQUENCE.length - 1)];
    const questionsThisRound = getQuestionsForRound(totalRounds, room.questionsPerRoundMode, room.baseQPerRound, currentRound);
    const alivePlayers = Array.from(room.alivePlayers.values()).filter(p => p.isAlive);

    if (alivePlayers.length <= 1) {
        return endGame(io, room, alivePlayers.length === 0 ? 'no_survivors' : 'last_survivor');
    }

    // Reset per-round tracking on all alive players
    alivePlayers.forEach(p => { p.correctThisRound = false; p.roundTimeTaken = 9999; });

    room.currentQInRound = 0;
    room.currentRoundDifficulty = difficulty;
    room.questionsThisRound = questionsThisRound;

    roomcast(io, roomId, 'survival:round_intro', {
        roundNumber: currentRound + 1, totalRounds,
        difficulty, questionsThisRound,
        aliveCount: alivePlayers.length,
        message: `Round ${currentRound + 1} of ${totalRounds} — Difficulty: ${difficulty.toUpperCase()}`
    });

    logger.info(`[SURVIVAL] Round ${currentRound + 1}/${totalRounds} | Difficulty: ${difficulty} | Qs: ${questionsThisRound} | Room: ${roomId}`);

    // Small delay for client to render the round intro, then fire first question
    setTimeout(() => sendNextQuestion(io, room), 2500);
};

/** Sends the next question within the current round */
const sendNextQuestion = async (io, room, retryCount = 0) => {
    const { roomId } = room;
    const MAX_RETRIES = 3;
    const difficulty  = room.currentRoundDifficulty || 'easy';

    const alivePlayers = Array.from(room.alivePlayers.values()).filter(p => p.isAlive);
    if (alivePlayers.length <= 1) {
        return endGame(io, room, alivePlayers.length === 0 ? 'no_survivors' : 'last_survivor');
    }

    room.pendingAnswers = new Set(alivePlayers.map(p => p.userId));

    let qData = null;
    try {
        qData = await generateAIQuestion(room.topic, difficulty, room.content);
        if (qData) qData.source = 'ai';
        else throw new Error('AI null');
    } catch (err) {
        logger.warn(`[SURVIVAL] AI Q failed (attempt ${retryCount + 1}): ${err.message}`);
        if (retryCount < MAX_RETRIES) {
            return setTimeout(() => sendNextQuestion(io, room, retryCount + 1), 2000);
        }
        qData = await fetchDBQuestion(room.topic, difficulty, room.usedQuestions);
    }

    if (!qData) {
        const panics = [
            { question: `In ${room.topic}, which concept is considered foundational for ${difficulty}-level mastery?`, options: ['Core Principles', 'Advanced Patterns', 'Edge Cases', 'Meta-analysis'], correctAnswer: 'Core Principles', explanation: 'Core principles underpin all advanced understanding.', timer: 20 },
            { question: `A ${difficulty} challenge arises in ${room.topic}. What is the primary response?`, options: ['Analyze First', 'Act Immediately', 'Delegate', 'Document'], correctAnswer: 'Analyze First', explanation: 'Analysis before action prevents compounded errors.', timer: 25 }
        ];
        qData = { ...panics[Math.floor(Math.random() * panics.length)], difficulty, topic: room.topic, source: 'panic_fallback' };
    }

    room.usedQuestions.push(qData.question);
    room.totalQAsked++;
    qData.globalIndex = room.totalQAsked;
    qData.index       = room.currentQInRound;
    qData.startedAt   = Date.now();
    room.currentQuestion = qData;

    const timer = qData.timer || difficultyTimer(difficulty);
    qData.timer = timer;

    if (room.sessionDoc) {
        room.sessionDoc.questions.push({
            questionIndex: room.totalQAsked, questionText: qData.question,
            options: qData.options, correctAnswer: qData.correctAnswer,
            explanation: qData.explanation || '', topic: qData.topic, difficulty,
            source: qData.source, timerGiven: timer,
            timeEstimate: qData.timeEstimate || { averageStudent: 15, belowAverageStudent: 25 }
        });
        room.sessionDoc.save().catch(e => logger.error('[SURVIVAL] Session Q save:', e.message));
    }

    roomcast(io, roomId, 'survival:new_question', {
        questionIndex: room.totalQAsked,
        questionNumber: room.currentQInRound + 1,
        totalQInRound: room.questionsThisRound,
        roundIndex: room.currentRound,
        roundNumber: room.currentRound + 1,
        totalRounds: room.totalRounds,
        question: qData.question, options: qData.options,
        difficulty, topic: qData.topic, timer, source: qData.source,
        aliveCount: alivePlayers.length
    });

    logger.info(`[SURVIVAL] Q${room.currentQInRound + 1}/${room.questionsThisRound} in Round ${room.currentRound + 1} | Diff:${difficulty} | Timer:${timer}s`);

    preloadNextQuestion(room.topic, difficulty);

    room.roundTimer = setTimeout(() => advanceQuestion(io, room), (timer + 2) * 1000);
};

/** Called after each individual question's timer. Moves to next Q or round end. */
const advanceQuestion = async (io, room) => {
    if (room.status !== 'active') return;
    clearTimeout(room.roundTimer);

    room.currentQInRound++;

    // Still more questions in this round?
    if (room.currentQInRound < room.questionsThisRound) {
        // 2s pause before next question within the round
        setTimeout(() => sendNextQuestion(io, room), 2000);
    } else {
        // All questions in round done → process round end
        await processRoundEnd(io, room);
    }
};

/** Called at end of a full round: score board + smart elimination + next round or game end */
const processRoundEnd = async (io, room) => {
    if (room.status !== 'active') return;
    clearTimeout(room.roundTimer);

    const { roomId, currentRound, totalRounds } = room;
    const { eliminated, survivors } = computeEliminations(room.alivePlayers, currentRound, room.alivePlayers.size);

    // Award round survival bonus to surviving players
    const roundBonus = ROUND_SURVIVAL_BONUS[currentRound + 1] || 10;
    survivors.forEach(p => { p.score += roundBonus; });

    // Eliminate players
    eliminated.forEach(p => {
        p.isAlive       = false;
        p.eliminatedAt  = currentRound;
        room.eliminatedPlayers.push(p);
        room.alivePlayers.delete(p.userId);

        // Notify eliminated player directly
        if (p.socketId) {
            io.to(p.socketId).emit('survival:eliminated', {
                survivalRounds: currentRound + 1,
                finalScore: p.score,
                message: p.correctThisRound
                    ? `Eliminated by performance score this round.`
                    : `Wrong answer — eliminated in Round ${currentRound + 1}.`
            });
        }
        logger.info(`[SURVIVAL] 💥 ${p.name} eliminated in Round ${currentRound + 1}`);
    });

    // Build current scoreboard (alive + eliminated)
    const allPlayers = [...Array.from(room.alivePlayers.values()), ...room.eliminatedPlayers]
        .sort((a, b) => b.score - a.score);
    allPlayers.forEach((p, i) => { p.rank = i + 1; });

    const leaderboard = allPlayers.map(p => ({
        rank: p.rank, userId: p.userId, name: p.name, score: p.score,
        isAlive: p.isAlive, eliminatedRound: p.eliminatedAt !== null ? p.eliminatedAt + 1 : null
    }));

    // Emit round result to ALL (survivors + spectators + eliminated watching)
    roomcast(io, roomId, 'survival:round_result', {
        roundNumber: currentRound + 1,
        totalRounds,
        eliminated: eliminated.map(p => ({ userId: p.userId, name: p.name, score: p.score })),
        survivors:  survivors.map(p => ({ userId: p.userId, name: p.name, score: p.score })),
        leaderboard,
        roundBonus,
        nextRound: currentRound + 1 < totalRounds ? currentRound + 2 : null
    });

    const stillAlive = Array.from(room.alivePlayers.values()).filter(p => p.isAlive);

    if (stillAlive.length <= 1 || currentRound >= totalRounds - 1) {
        // Game over
        setTimeout(() => endGame(io, room,
            stillAlive.length === 0 ? 'all_eliminated' :
            stillAlive.length === 1 ? 'last_survivor' : 'max_rounds_reached'
        ), 4000);
    } else {
        // Advance to next round
        room.currentRound++;
        setTimeout(() => beginRound(io, room), 5000); // 5s leaderboard display time
    }
};

/** Ends the game: assigns final ranks, emits to ALL, saves to MongoDB. */
const endGame = async (io, room, reason = 'completed') => {
    if (room.status === 'completed') return;
    room.status = 'completed';
    clearTimeout(room.roundTimer);

    const { roomId } = room;
    const endedAt    = new Date();
    const duration   = room.startedAt ? Math.round((endedAt - new Date(room.startedAt)) / 1000) : 0;

    const allPlayers = [...Array.from(room.alivePlayers.values()), ...room.eliminatedPlayers];

    allPlayers.sort((a, b) => {
        if (a.isAlive !== b.isAlive) return a.isAlive ? -1 : 1;
        if (b.score !== a.score) return b.score - a.score;
        const aRound = a.eliminatedAt ?? room.currentRound + 1;
        const bRound = b.eliminatedAt ?? room.currentRound + 1;
        return bRound - aRound;
    });

    allPlayers.forEach((p, i) => { p.rank = i + 1; });

    const winner = allPlayers[0] || null;

    const leaderboard = allPlayers.map(p => ({
        rank: p.rank, userId: p.userId, name: p.name, score: p.score,
        isAlive: p.isAlive, isWinner: p.rank === 1,
        eliminatedRound: p.eliminatedAt !== null ? p.eliminatedAt + 1 : null,
        survivalRounds:  p.eliminatedAt !== null ? p.eliminatedAt + 1 : room.currentRound + 1,
        accuracy: calcPlayerAccuracy(p), answers: p.answers.length
    }));

    // Emit final result to EVERYONE in the room (alive or spectating)
    roomcast(io, roomId, 'survival:game_ended', {
        reason,
        winner: winner ? { userId: winner.userId, name: winner.name, score: winner.score } : null,
        leaderboard,
        totalRounds: room.currentRound + 1,
        totalQuestions: room.totalQAsked,
        duration
    });

    try {
        if (room.sessionDoc) {
            const allAnswers = allPlayers.reduce((sum, p) => sum + p.answers.filter(a => a.isCorrect).length, 0);
            const allTotal   = allPlayers.reduce((sum, p) => sum + p.answers.length, 0);

            room.sessionDoc.status         = 'completed';
            room.sessionDoc.endedAt        = endedAt;
            room.sessionDoc.duration       = duration;
            room.sessionDoc.totalQuestions = room.totalQAsked;
            room.sessionDoc.winner         = winner ? { userId: winner.userId, name: winner.name } : { userId: null, name: 'No winner' };
            room.sessionDoc.avgAccuracy    = allTotal > 0 ? Math.round((allAnswers / allTotal) * 100) : 0;
            room.sessionDoc.players        = allPlayers.map(p => {
                const correct = p.answers.filter(a => a.isCorrect).length;
                return {
                    userId: p.userId, name: p.name, rollNumber: p.rollNumber,
                    department: p.department, section: p.section,
                    score: p.score, rank: p.rank, isWinner: p.rank === 1,
                    eliminatedAt: p.eliminatedAt, answers: p.answers,
                    accuracy: p.answers.length > 0 ? Math.round((correct / p.answers.length) * 100) : 0,
                    survivalRounds: p.eliminatedAt !== null ? p.eliminatedAt + 1 : room.currentRound + 1
                };
            });
            await room.sessionDoc.save();
            logger.info(`[SURVIVAL] 📦 Session saved: ${room.sessionDoc._id}`);
        }
    } catch (err) { logger.error('[SURVIVAL] MongoDB save error:', err.message); }

    setTimeout(() => {
        if (room.pin) pinToRoomId.delete(room.pin);
        survivalRooms.delete(roomId);
        broadcastRoomsList(io);
    }, 5 * 60 * 1000);

    logger.info(`[SURVIVAL] 🏆 Game ended | Room: ${roomId} | Reason: ${reason} | Winner: ${winner?.name || 'None'}`);
};
