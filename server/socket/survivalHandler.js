/**
 * ============================================================
 *  survivalHandler.js — Socket.IO Handler for Survival Mode
 *
 *  GAME FLOW:
 *    1. Host creates a survival room  →  survival:create
 *    2. Players join room             →  survival:join
 *    3. Host starts game              →  survival:start
 *    4. Server generates AI question, decides timer, emits →  newQuestion
 *    5. Players submit answers        →  survival:submit_answer
 *    6. Wrong-answer players get eliminated
 *    7. Repeat until 1 survivor OR all questions exhausted
 *    8. Winner declared, session saved to MongoDB
 *
 *  AI Integration:
 *    - generateAIQuestion() called before each round
 *    - If AI fails, falls back to random DB question
 *    - Timer set dynamically via decideTimer()
 *    - Next question preloaded while current round plays
 * ============================================================
 */

const Quiz           = require('../models/Quiz');
const SurvivalSession = require('../models/SurvivalSession');
const User           = require('../models/User');
const { generateAIQuestion, decideTimer, difficultyTimer, preloadNextQuestion } = require('../services/aiQuestionService');
const logger         = require('../utils/logger');

// ── In-memory survival rooms ──────────────────────────────────
// roomId → { host, players, questions, config, status, currentQ, sessionId, pin }
let survivalRooms = new Map();
// pin → roomId (for quick lookup)
let pinToRoomId = new Map();

// --- RESET ON START (Fresh Slate Requirement) ---
survivalRooms.clear();
pinToRoomId.clear();

// ── Helper: broadcast to all in room ─────────────────────────
const roomcast = (io, roomId, event, data) => {
    io.to(`survival:${roomId}`).emit(event, data);
};

// ── Helper: generate a safe room ID ──────────────────────────
const mkRoomId = () => `sv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
const mkPin = () => {
    let pin;
    do {
        pin = Math.floor(100000 + Math.random() * 900000).toString();
    } while (pinToRoomId.has(pin)); // Ensure uniqueness
    return pin;
};

// ── Helper: calculate ai question stats ──────────────────────
const calcStats = (players) => {
    const total = players.length;
    if (!total) return { avgAccuracy: 0, totalCorrectAnswers: 0 };
    const totalCorrect   = players.reduce((sum, p) => sum + p.answers.filter(a => a.isCorrect).length, 0);
    const totalAnswered  = players.reduce((sum, p) => sum + p.answers.length, 0);
    const avgAccuracy    = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
    return { avgAccuracy, totalCorrectAnswers: totalCorrect };
};

// ── Fetch DB fallback question ────────────────────────────────
const fetchDBQuestion = async (topic, difficulty, usedTexts = []) => {
    try {
        const filter = {
            'questions.difficulty': difficulty,
            status: { $in: ['done', 'completed', 'waiting', 'live'] }
        };
        if (topic && topic !== 'General') {
            filter.$or = [
                { subject: { $regex: topic, $options: 'i' } },
                { title:   { $regex: topic, $options: 'i' } }
            ];
        }
        const quizzes = await Quiz.find(filter).select('questions subject difficulty').lean().limit(20);
        const pool = [];
        quizzes.forEach(qz => {
            qz.questions.forEach(q => {
                if (q.difficulty === difficulty && !usedTexts.includes(q.text) && q.options.length >= 2) {
                    pool.push({ ...q, topic: qz.subject || topic });
                }
            });
        });
        if (!pool.length) return null;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        return {
            question:      pick.text,
            options:       pick.options,
            correctAnswer: pick.correctAnswer,
            explanation:   pick.explanation || '',
            difficulty:    pick.difficulty,
            topic:         pick.topic,
            timeEstimate:  null,
            timer:         difficultyTimer(difficulty),
            source:        'db'
        };
    } catch (err) {
        logger.error('[SurvivalHandler] DB fallback error:', err.message);
        return null;
    }
};

// ── Main handler export ───────────────────────────────────────
module.exports = (io, socket) => {
    if (!socket.user) return;

    const userId   = socket.user._id.toString();
    const userName  = socket.user.name;

    // ── 1. CREATE ROOM ────────────────────────────────────────
    socket.on('survival:create', async (data) => {
        const {
            topic        = 'General',
            difficulty   = 'medium',
            title        = 'Survival Arena',
            description  = 'Survival Match',
            maxPlayers   = 50,
            quizId       = null
        } = data || {};

        const roomId = mkRoomId();
        const pin    = mkPin();
        const room = {
            roomId,
            pin,
            title,
            description,
            host:          userId,
            hostName:      userName,
            topic,
            content:       data.content || null, // Store pasted text or PDF content
            difficulty,
            maxQuestions:  5,
            maxPlayers:    parseInt(maxPlayers) || 50,
            quizId,
            status:        'waiting',
            currentQIndex: -1,
            alivePlayers:  new Map(),    // userId → playerObj
            eliminatedPlayers: [],
            usedQuestions: [],          // question texts for de-dupe
            currentQuestion: null,      // live question object
            roundTimer: null,           // setTimeout handle
            sessionDoc: null            // SurvivalSession mongoose doc
        };

        survivalRooms.set(roomId, room);
        pinToRoomId.set(pin, roomId);
        socket.join(`survival:${roomId}`);

        // Add host as first player
        room.alivePlayers.set(userId, {
            userId,
            name:           userName,
            avatar:         socket.user.avatar,
            rollNumber:     socket.user.rollNumber || '',
            department:     socket.user.department || '',
            section:        socket.user.section    || '',
            socketId:       socket.id,
            score:          0,
            answers:        [],
            isAlive:        true,
            eliminatedAt:   null
        });

        try {
            const sessionDoc = new SurvivalSession({
                roomId,
                pin,
                title,
                description,
                host:       userId,
                hostName:   userName,
                topic,
                difficulty,
                maxPlayers: room.maxPlayers,
                status:     'waiting',
                players:    [{
                    userId, name: userName, score: 0, isAlive: true
                }]
            });
            await sessionDoc.save();
            room.sessionDoc = sessionDoc;

            socket.emit('survival:created', { 
                roomId, pin, topic, title, description,
                difficulty, maxQuestions: 5, 
                maxPlayers: room.maxPlayers,
                host: userId // CRITICAL: Host must know they ARE the host!
            });
            broadcastRoomsList(io); 
            logger.info(`[SURVIVAL] Match Saved & Created: ${roomId} | PIN: ${pin}`);
        } catch (err) {
            logger.error('[SURVIVAL] DB Save/Create failed:', err.message);
            socket.emit('error', { message: 'Database failure. Please try again.' });
        }
    });

    // ── 1.1 JOIN BY PIN (Direct Support) ───────────────────────
    socket.on('survival:join_by_pin', async (data) => {
        const { pin } = data || {};
        if (!pin) return socket.emit('error', { message: 'PIN is required.' });
        
        const pinStr = pin.toString();
        const roomId = pinToRoomId.get(pinStr);
        if (!roomId) return socket.emit('error', { message: 'Invalid PIN. Room not found.' });

        const room = survivalRooms.get(roomId);
        if (!room) return socket.emit('error', { message: 'Room data lost or expired.' });
        if (room.status !== 'waiting') return socket.emit('error', { message: 'Match already in progress.' });

        // Forward to the standard join logic
        socket.emit('survival:pin_resolved', { roomId });
        logger.info(`[SURVIVAL] PIN ${pinStr} resolved to ${roomId} for ${userName}`);
    });

    // ── 2. JOIN ROOM ──────────────────────────────────────────
    socket.on('survival:join', async (data) => {
        const { roomId } = data || {};
        const room = survivalRooms.get(roomId);

        if (!room) return socket.emit('error', { message: 'Survival room not found.' });
        
        // Reconnection logic: allow entry if user is already registered in the room (e.g., refresh recovery)
        const isReconnecting = room.alivePlayers.has(userId) || room.host === userId;
        
        if (!isReconnecting && room.status !== 'waiting') {
            return socket.emit('error', { message: 'Game already in progress.' });
        }
        
        // CHECK PLAYER LIMIT
        if (room.alivePlayers.size >= room.maxPlayers) {
            return socket.emit('error', { message: `Room is full. Max capacity is ${room.maxPlayers} players.` });
        }

        socket.join(`survival:${roomId}`);

        // Upsert player (host may rejoin)
        if (!room.alivePlayers.has(userId)) {
            room.alivePlayers.set(userId, {
                userId,
                name:         userName,
                avatar:       socket.user.avatar,
                rollNumber:   socket.user.rollNumber || '',
                department:   socket.user.department || '',
                section:      socket.user.section    || '',
                socketId:     socket.id, // -- Store initial socketId --
                score:        0,
                answers:      [],
                isAlive:      true,
                eliminatedAt: null
            });
        } else {
            // Update socketId for reconnections
            const p = room.alivePlayers.get(userId);
            p.socketId = socket.id;
        }

        const playersArr = Array.from(room.alivePlayers.values()).map(p => ({
            userId: p.userId,
            name:   p.name,
            avatar: p.avatar
        }));

        roomcast(io, roomId, 'survival:player_joined', {
            player:  { userId, name: userName, avatar: socket.user.avatar },
            players: playersArr
        });

        // Bug 5: Push new player to sessionDoc on join
        if (room.sessionDoc) {
            const alreadyInSession = room.sessionDoc.players.some(
                p => p.userId?.toString() === userId
            );
            if (!alreadyInSession) {
                room.sessionDoc.players.push({ 
                    userId, 
                    name: userName, 
                    score: 0, 
                    isAlive: true 
                });
                room.sessionDoc.save().catch(err => logger.error('[SURVIVAL] Session join save error:', err.message));
            }
        }

        socket.emit('survival:room_state', {
            roomId,
            title:      room.title,
            description: room.description,
            topic:      room.topic,
            difficulty: room.difficulty,
            players:    playersArr,
            status:     room.status,
            host:       room.host, // Send host!
            maxPlayers: room.maxPlayers
        });

        // Reconnection synchronization payload: Catch up the player if a round is active
        if (room.status === 'active' && room.currentQuestion) {
            const alivePlayers = Array.from(room.alivePlayers.values()).filter(p => p.isAlive);
            const qData = room.currentQuestion;
            const timerObj = qData.timer || 20; 
            const elapsed = Math.floor((Date.now() - qData.startedAt) / 1000);
            const remaining = Math.max(0, timerObj - elapsed);

            socket.emit('survival:new_question', {
                questionIndex:  room.currentQIndex,
                questionNumber: room.currentQIndex + 1,
                totalQuestions: room.maxQuestions,
                question:       qData.question,
                options:        qData.options,
                difficulty:     qData.difficulty,
                topic:          qData.topic,
                timer:          remaining,
                source:         qData.source,
                aliveCount:     alivePlayers.length,
                statusMessage:  "Mid-round re-sync..."
            });
        }

        logger.info(`[SURVIVAL] ${userName} joined room ${roomId}`);
    });

    // ── 3. START GAME (host only) ─────────────────────────────
    socket.on('survival:start', async (data) => {
        const { roomId } = data || {};
        const room = survivalRooms.get(roomId);
        if (!room) return socket.emit('error', { message: 'Room not found.' });
        if (room.host !== userId) return socket.emit('error', { message: 'Only the host can start.' });

        // Bug 1 & 2: Set status to active and startedAt
        room.status = 'active';
        room.startedAt = new Date();

        roomcast(io, roomId, 'survival:game_starting', {
            roomId,
            players: Array.from(room.alivePlayers.values()).map(p => ({
                userId: p.userId, name: p.name
            })),
            maxQuestions: room.maxQuestions
        });

        // Small delay for client UI transition, then fire first question
        setTimeout(() => sendNextQuestion(io, room), 3000);

        logger.info(`[SURVIVAL] Game started: ${roomId} | Players: ${room.alivePlayers.size}`);
    });

    // ── 4. SUBMIT ANSWER ──────────────────────────────────────
    socket.on('survival:submit_answer', async (data) => {
        const { roomId, answer, questionIndex } = data || {};
        const room = survivalRooms.get(roomId);
        if (!room || room.status !== 'active') return;

        const player = room.alivePlayers.get(userId);
        if (!player || !player.isAlive) return;

        // Prevent duplicate submission for the same round
        if (player.answers.some(a => a.questionIndex === questionIndex)) return;

        const q         = room.currentQuestion;
        if (!q || q.index !== questionIndex) return;

        const isCorrect = answer && answer.trim() === q.correctAnswer.trim();
        const timeTaken = Date.now() - q.startedAt;

        const answerRecord = {
            questionIndex,
            questionText:   q.question,
            selectedAnswer: answer || '',
            correctAnswer:  q.correctAnswer,
            isCorrect,
            timeTaken,
            scoreAwarded:  isCorrect ? getPointsByRound(questionIndex + 1) : 0
        };

        player.answers.push(answerRecord);
        if (isCorrect) player.score += answerRecord.scoreAwarded;

        // Acknowledge to player
        socket.emit('survival:answer_ack', {
            isCorrect,
            correctAnswer:  q.correctAnswer,
            explanation:    q.explanation || '',
            scoreAwarded:   answerRecord.scoreAwarded,
            totalScore:     player.score
        });

        // Update pending answers
        if (room.pendingAnswers) {
            room.pendingAnswers.delete(userId);
            // If all alive players have answered, advance immediately
            if (room.pendingAnswers.size === 0) {
                clearTimeout(room.roundTimer);
                processRoundEnd(io, room);
            }
        }

        logger.info(`[SURVIVAL] ${userName} answered Q${questionIndex} | Correct: ${isCorrect}`);
    });

    // ── 5. LEAVE ──────────────────────────────────────────────
    socket.on('survival:leave', async (data) => {
        const { roomId } = data || {};
        const room = survivalRooms.get(roomId);
        if (!room) return;

        // Bug 4: Actually eliminate on leave
        const player = room.alivePlayers.get(userId);
        if (player && player.isAlive) {
            player.isAlive = false;
            player.eliminatedAt = room.currentQIndex >= 0 ? room.currentQIndex : 0;
        }

        socket.leave(`survival:${roomId}`);
        logger.info(`[SURVIVAL] ${userName} left room ${roomId}`);
    });

    // ── 6. GET ROOM LIST (for lobby) ──────────────────────────
    socket.on('survival:get_rooms', () => {
        const openRooms = [];
        for (const [roomId, room] of survivalRooms.entries()) {
            if (room.status === 'waiting') {
                openRooms.push({
                    roomId,
                    title:       room.title,
                    description: room.description,
                    hostName:    room.hostName,
                    topic:       room.topic,
                    difficulty:  room.difficulty,
                    playerCount: room.alivePlayers.size,
                    maxPlayers:  room.maxPlayers
                });
            }
        }
        socket.emit('survival:rooms_list', openRooms);
    });
};

// ═══════════════════════════════════════════════════════════════
//  INTERNAL GAME LOGIC (module-level helpers)
// ═══════════════════════════════════════════════════════════════

/**
 * Emits the next AI-generated question to the room.
 * Falls back to DB if Gemini fails.
 */
const sendNextQuestion = async (io, room, retryCount = 0) => {
    const { roomId, topic, difficulty, currentQIndex } = room;
    const MAX_RETRIES = 3;
    const ROUND_LIMIT = 5;

    // Check termination conditions
    const alivePlayers = Array.from(room.alivePlayers.values()).filter(p => p.isAlive);

    if (alivePlayers.length === 0) {
        return endGame(io, room, 'no_survivors');
    }

    if (alivePlayers.length === 1 && room.currentQIndex >= 0) {
        return endGame(io, room, 'last_survivor');
    }

    // STRICT 5 ROUND LIMIT
    if (room.currentQIndex >= ROUND_LIMIT - 1) {
        return endGame(io, room, 'max_rounds_reached');
    }

    room.currentQIndex++;

    // ── Inform room: preparing next question ───────────────────
    roomcast(io, roomId, 'survival:preparing_question', {
        questionIndex: room.currentQIndex,
        aliveCount:    alivePlayers.length
    });

    // Track who needs to answer this round
    room.pendingAnswers = new Set(alivePlayers.map(p => p.userId));

    let qData = null;
    // ── Try AI first, fallback to DB ───────────────────────────
    try {
        logger.info(`[SURVIVAL] Generating AI Q (Attempt ${retryCount + 1}/3) for room ${roomId} | Q${room.currentQIndex + 1}`);
        qData = await generateAIQuestion(topic, difficulty, room.content);
        if (qData) {
            qData.source = 'ai';
        } else {
            throw new Error('AI returned null payload');
        }
    } catch (err) {
        logger.warn(`[SURVIVAL] AI generation failure (Attempt ${retryCount + 1}): ${err.message}`);
        
        if (retryCount < MAX_RETRIES) {
            // Wait 2s and retry
            return setTimeout(() => sendNextQuestion(io, room, retryCount + 1), 2000);
        } else {
            // Give up on AI, try ONE DB fallback
            logger.warn(`[SURVIVAL] AI failed 3 times. Falling back to DB...`);
            qData = await fetchDBQuestion(topic, difficulty, room.usedQuestions);
        }
    }

    if (!qData) {
        // --- ABSOLUTE FINAL RESORT: Panic Fallback (Never Fail) ---
        logger.warn(`[SURVIVAL] 🚨 Panic Fallback triggered for room ${roomId}`);
        const fallbacks = [
            {
                question: `In a high-stakes survival simulation on "${topic}", which factor is generally considered THE most critical for long-term endurance?`,
                options:  ['Strategic Planning', 'Resource Management', 'Emotional Intelligence', 'Technical Skill'],
                correctAnswer: 'Resource Management',
                explanation: 'While all are important, managing your limited resources is the foundation of survival in any competitive arena.',
                timer: 25
            },
            {
                question: `A sudden shift in ${topic} protocol occurs. What is the most adaptive response for a synchronized participant?`,
                options:  ['Immediate Pivot', 'Consult Manual', 'Wait for Command', 'Ignore Change'],
                correctAnswer: 'Immediate Pivot',
                explanation: 'Adaptability and rapid pivoting are the hallmarks of survival in dynamic environments.',
                timer: 20
            }
        ];
        const pick = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        qData = {
            ...pick,
            difficulty,
            topic,
            timeEstimate: { averageStudent: 15, belowAverageStudent: 25 },
            source: 'panic_fallback'
        };
    }

    // Mark question as used
    room.usedQuestions.push(qData.question);

    // Attach session context
    qData.index    = room.currentQIndex;
    qData.startedAt = Date.now();

    room.currentQuestion = qData;
    room.currentAnswers  = new Set(); // track who has answered

    const timer = qData.timer || difficultyTimer(difficulty);

    // Store question in session document
    if (room.sessionDoc) {
        room.sessionDoc.questions.push({
            questionIndex: room.currentQIndex,
            questionText:  qData.question,
            options:       qData.options,
            correctAnswer: qData.correctAnswer,
            explanation:   qData.explanation || '',
            topic:         qData.topic,
            difficulty:    qData.difficulty,
            source:        qData.source,
            timerGiven:    timer,
            timeEstimate:  qData.timeEstimate || { averageStudent: 15, belowAverageStudent: 25 }
        });
        // Avoid blocking — update async
        room.sessionDoc.save().catch(err => logger.error('[SURVIVAL] Session save error:', err.message));
    }

    // ── Emit question to all alive players ─────────────────────
    roomcast(io, roomId, 'survival:new_question', {
        questionIndex:  room.currentQIndex,
        questionNumber: room.currentQIndex + 1,
        totalQuestions: room.maxQuestions,
        question:       qData.question,
        options:        qData.options,
        difficulty:     qData.difficulty,
        topic:          qData.topic,
        timer,                                // ← Dynamic timer from AI
        source:         qData.source,
        aliveCount:     alivePlayers.length,
        // Psychological triggers
        statusMessage:  buildStatusMessage(alivePlayers.length, room.currentQIndex)
    });

    logger.info(`[SURVIVAL] Q${room.currentQIndex + 1} emitted | Timer: ${timer}s | Source: ${qData.source} | Room: ${roomId}`);

    // ── Start preloading next question in background ───────────
    preloadNextQuestion(topic, difficulty);

    // ── Auto-advance: mark non-responders after timer ──────────
    room.roundTimer = setTimeout(async () => {
        await processRoundEnd(io, room);
    }, (timer + 2) * 1000); // +2s grace
};

/**
 * Called after timer expires or all alive players answered.
 * Eliminates players who answered wrong.
 */
const processRoundEnd = async (io, room) => {
    if (room.status !== 'active') return;

    const { roomId } = room;
    const q = room.currentQuestion;
    if (!q) return;

    clearTimeout(room.roundTimer);

    const eliminated = [];
    const survivors  = [];

    for (const [pid, player] of room.alivePlayers.entries()) {
        if (!player.isAlive) continue;

        const lastAnswer = player.answers.find(a => a.questionIndex === q.index);

        if (!lastAnswer || !lastAnswer.isCorrect) {
            // Eliminate player
            player.isAlive       = false;
            player.eliminatedAt  = q.index;
            eliminated.push({ userId: player.userId, name: player.name });
            
            // Notify player immediately with correct payload shape
            if (player.socketId) {
                io.to(player.socketId).emit('survival:eliminated', {
                    survivalRounds: q.index, 
                    finalScore: player.score,
                    message: lastAnswer ? "Wrong Answer! You have been eliminated." : "Time's up! You have been eliminated."
                });
            }

            logger.info(`[SURVIVAL] 💥 ${player.name} eliminated at Q${q.index + 1}`);
        } else {
            survivors.push({ userId: player.userId, name: player.name, score: player.score });
        }
    }

    // Assign rank to eliminated players (based on round survived)
    const currentAlive = Array.from(room.alivePlayers.values()).filter(p => p.isAlive);

    // Emit elimination event
    roomcast(io, roomId, 'survival:round_result', {
        questionIndex:  q.index,
        correctAnswer:  q.correctAnswer,
        explanation:    q.explanation,
        eliminated,
        survivors:       currentAlive.map(p => ({ userId: p.userId, name: p.name, score: p.score })),
        leaderboard:     getScoreboard(room)
    });

    /* Individual notifications moved to the loop above for immediate feedback */

    // Bug 9: Broadcast live scores
    broadcastScores(io, room);

    // Survive/end check
    const stillAlive = Array.from(room.alivePlayers.values()).filter(p => p.isAlive);

    if (stillAlive.length <= 1) {
        // Give a moment before ending
        setTimeout(() => endGame(io, room, stillAlive.length === 0 ? 'all_eliminated' : 'last_survivor'), 2000);
    } else {
        // Continue to next round after brief pause
        setTimeout(() => sendNextQuestion(io, room), 4000);
    }
};

/**
 * Ends the game, assigns final ranks, saves to MongoDB.
 */
const endGame = async (io, room, reason = 'completed') => {
    if (room.status === 'completed') return; // Prevent double-trigger
    room.status = 'completed';
    clearTimeout(room.roundTimer);

    const { roomId } = room;
    const allPlayers = Array.from(room.alivePlayers.values());
    const endedAt    = new Date();
    const duration   = room.startedAt ? Math.round((endedAt - room.startedAt) / 1000) : 0;

    // Sort: alive first (by score), then by rounds survived
    allPlayers.sort((a, b) => {
        if (a.isAlive !== b.isAlive) return a.isAlive ? -1 : 1;
        if (b.score !== a.score) return b.score - a.score;
        const aRound = a.eliminatedAt ?? room.currentQIndex + 1;
        const bRound = b.eliminatedAt ?? room.currentQIndex + 1;
        return bRound - aRound;
    });

    // Assign final ranks
    allPlayers.forEach((p, i) => { p.rank = i + 1; });
    
    // Rule: Stalemate? (Everyone eliminated in same round)
    // Or did someone actually survive?
    const actualSurvivors = allPlayers.filter(p => p.isAlive);
    const winner = actualSurvivors.length === 1 ? actualSurvivors[0] : allPlayers[0];

    // Build leaderboard payload
    const leaderboard = allPlayers.map(p => ({
        userId:         p.userId,
        name:           p.name,
        rank:           p.rank,
        score:          p.score,
        isWinner:       p.rank === 1,
        eliminatedAt:   p.eliminatedAt,
        survivalRounds: p.eliminatedAt !== null ? p.eliminatedAt + 1 : room.currentQIndex + 1,
        accuracy:       calcPlayerAccuracy(p)
    }));

    // ── Emit game result to all ────────────────────────────────
    roomcast(io, roomId, 'survival:game_ended', {
        reason,
        winner:    winner ? { userId: winner.userId, name: winner.name } : null,
        leaderboard,
        totalRounds:  room.currentQIndex + 1,
        duration
    });

    // ── Save final session to MongoDB ──────────────────────────
    try {
        if (room.sessionDoc) {
            const stats = calcStats(allPlayers);

            room.sessionDoc.status         = 'completed';
            room.sessionDoc.endedAt        = endedAt;
            room.sessionDoc.duration       = duration;
            room.sessionDoc.totalQuestions = room.currentQIndex + 1;
            room.sessionDoc.winner         = winner
                ? { userId: winner.userId, name: winner.name }
                : { userId: null, name: 'No winner' };
            room.sessionDoc.avgAccuracy          = stats.avgAccuracy;
            room.sessionDoc.totalCorrectAnswers  = stats.totalCorrectAnswers;

            // Save full player results
            room.sessionDoc.players = allPlayers.map(p => {
                const correctCount = p.answers.filter(a => a.isCorrect).length;
                const totalAnswers = p.answers.length;
                return {
                    userId:         p.userId,
                    name:           p.name,
                    rollNumber:     p.rollNumber,
                    department:     p.department,
                    section:        p.section,
                    score:          p.score,
                    rank:           p.rank,
                    isWinner:       p.rank === 1,
                    eliminatedAt:   p.eliminatedAt,
                    answers:        p.answers,
                    accuracy:       totalAnswers > 0 ? Math.round((correctCount / totalAnswers) * 100) : 0,
                    avgTimeTaken:   totalAnswers > 0
                        ? Math.round(p.answers.reduce((sum, a) => sum + (a.timeTaken || 0), 0) / totalAnswers)
                        : 0,
                    survivalRounds: p.eliminatedAt !== null ? p.eliminatedAt + 1 : room.currentQIndex + 1,
                    weakTopics:    findWeakTopics(p.answers, room.sessionDoc.questions || [])
                };
            });

            await room.sessionDoc.save();
            logger.info(`[SURVIVAL] 📦 Session saved to MongoDB: ${room.sessionDoc._id} | Room: ${roomId}`);
        }
    } catch (err) {
        logger.error(`[SURVIVAL] MongoDB save error: ${err.message}`);
    }

    // Cleanup room after 5 minutes
    setTimeout(() => {
        if (room.pin) pinToRoomId.delete(room.pin);
        survivalRooms.delete(roomId);
    }, 5 * 60 * 1000);
    broadcastRoomsList(io); // Update lobby
    logger.info(`[SURVIVAL] 🏆 Game ended: ${roomId} | Reason: ${reason} | Winner: ${winner?.name || 'None'}`);
};

const broadcastRoomsList = (io) => {
    const openRooms = [];
    for (const [roomId, room] of survivalRooms.entries()) {
        if (room.status === 'waiting') {
            openRooms.push({
                roomId,
                title:       room.title,
                description: room.description,
                hostName:    room.hostName,
                pin:         room.pin, // Send PIN too
                topic:       room.topic,
                difficulty:  room.difficulty,
                playerCount: room.alivePlayers.size,
                maxPlayers:  room.maxPlayers
            });
        }
    }
    // io.emit ensures ALL clients get the update
    io.emit('survival:rooms_list', openRooms);
};

// -- Round-based Scoring (Requirement: 5, 10, 15, 20, 25) --
const getPointsByRound = (round) => {
    const table = { 1: 5, 2: 10, 3: 15, 4: 20, 5: 25 };
    return table[round] || 0;
};

const getPoints = (difficulty) => {
    const pts = { easy: 5, medium: 10, hard: 15, advanced: 20 };
    return pts[difficulty] || 10;
};

const getScoreboard = (room) => {
    return Array.from(room.alivePlayers.values())
        .sort((a, b) => b.score - a.score)
        .map((p, i) => ({
            rank:    i + 1,
            userId:  p.userId,
            name:    p.name,
            score:   p.score,
            isAlive: p.isAlive
        }));
};

const calcPlayerAccuracy = (player) => {
    if (!player.answers.length) return 0;
    const correct = player.answers.filter(a => a.isCorrect).length;
    return Math.round((correct / player.answers.length) * 100);
};

const findWeakTopics = (answers, questions) => {
    const weak = new Set();
    answers.forEach(a => {
        if (!a.isCorrect) {
            const q = questions.find(q => q.questionText === a.questionText);
            if (q?.topic) weak.add(q.topic);
        }
    });
    return Array.from(weak);
};

const buildStatusMessage = (aliveCount, roundIndex) => {
    if (aliveCount <= 2) return `⚡ FINAL DUEL! Only ${aliveCount} players remain!`;
    if (aliveCount <= 5) return `🔥 Only ${aliveCount} survive! Stay sharp!`;
    if (roundIndex === 0) return '🚀 First elimination round! 1 wrong = OUT!';
    return `⚠️ Round ${roundIndex + 1}: ${aliveCount} players alive. One mistake = elimination!`;
};

// Bug 9 Helper: Broadcast live scores
const broadcastScores = (io, room) => {
    const scores = Array.from(room.alivePlayers.values())
        .sort((a, b) => b.score - a.score)
        .map((p, i) => ({
            rank: i + 1,
            userId: p.userId,
            name: p.name,
            score: p.score,
            isAlive: p.isAlive
        }));
    roomcast(io, room.roomId, 'survival:score_update', { scores });
};


