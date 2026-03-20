const Battle = require('../models/Battle');
const Quiz = require('../models/Quiz');
const User = require('../models/User');
const logger = require('../utils/logger');
const { calculateScore } = require('../utils/calculateScore');

// Matchmaking Queue
let waitingPlayers = [];

module.exports = (io, socket) => {
    
    // --- 1. Find a Match ---
    socket.on('battle:find_match', async (data) => {
        const userId = socket.user._id.toString();
        
        // Prevent double queuing
        if (waitingPlayers.find(p => p.userId === userId)) return;

        logger.info(`🔍 [BATTLE] ${socket.user.name} looking for match...`);

        if (waitingPlayers.length > 0) {
            // Found an opponent!
            const opponent = waitingPlayers.shift();
            
            // Create a unique Battle Room
            const roomID = `battle_${Date.now()}_${userId}`;
            
            // Pick a random public quiz for the battle (or a specific topic if requested)
            let randomQuiz = await Quiz.findOne({ isPublic: true }).select('_id title questions settings');
            
            // Fallback: If no public quizzes, pick ANY quiz (excluding drafts if possible)
            if (!randomQuiz) {
                logger.info('⚠️ [BATTLE] No public quizzes found, falling back to any available quiz');
                randomQuiz = await Quiz.findOne({ 
                    status: { $ne: 'draft' },
                    'questions.0': { $exists: true } 
                }).select('_id title questions settings');
            }

            if (!randomQuiz) {
                logger.error('❌ [BATTLE] Matching failed: No quizzes found in system');
                socket.emit('error', { message: 'No play-ready quizzes available in the system yet.' });
                opponentSocket.emit('error', { message: 'Matchmaking aborted: No play-ready quizzes found.' });
                return;
            }

            const newBattle = new Battle({
                roomID,
                quizId: randomQuiz._id,
                players: [
                    { userId: opponent.userId, name: opponent.name, socketId: opponent.socketId },
                    { userId: userId, name: socket.user.name, socketId: socket.id }
                ],
                status: 'active'
            });

            await newBattle.save();

            // Join both sockets to the room
            const opponentSocket = io.sockets.sockets.get(opponent.socketId);
            if (opponentSocket) opponentSocket.join(roomID);
            socket.join(roomID);

            // Notify both players
            io.to(roomID).emit('battle:started', {
                battleId: newBattle._id,
                roomID,
                quiz: {
                    title: randomQuiz.title,
                    questions: randomQuiz.questions,
                    settings: randomQuiz.settings
                },
                players: newBattle.players
            });

            logger.info(`⚔️ [BATTLE] Match started: ${opponent.name} vs ${socket.user.name}`);
        } else {
            // Add to queue
            waitingPlayers.push({
                userId,
                name: socket.user.name,
                socketId: socket.id
            });
            socket.emit('battle:searching', { message: 'Searching for opponent...' });
        }
    });

    // --- 2. Leave Queue ---
    socket.on('battle:leave_queue', () => {
        waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
        socket.emit('battle:cancelled');
    });

    // --- 3. Submit Answer in Battle ---
    socket.on('battle:submit_answer', async (data) => {
        const { battleId, questionIndex, answer, timeTaken } = data;
        
        try {
            const battle = await Battle.findById(battleId).populate('quizId');
            if (!battle || battle.status !== 'active') return;

            const player = battle.players.find(p => p.userId.toString() === socket.user._id.toString());
            const opponent = battle.players.find(p => p.userId.toString() !== socket.user._id.toString());

            if (!player) return;

            const question = battle.quizId.questions[questionIndex];
            const { isCorrect, scoreAwarded } = calculateScore(question, answer, timeTaken / 1000, battle.quizId.settings);

            player.score += scoreAwarded;
            player.answers.push({ questionIndex, isCorrect, timeSpent: timeTaken });

            // Send real-time update to opponent
            if (opponent.socketId) {
                io.to(opponent.socketId).emit('battle:opponent_update', {
                    opponentScore: player.score,
                    questionIndex,
                    isCorrect
                });
            }

            // Check if both finished this question or all questions
            const totalQuestions = battle.quizId.questions.length;
            const everyoneFinished = battle.players.every(p => p.answers.length === totalQuestions);

            if (everyoneFinished) {
                battle.status = 'completed';
                // Determine winner
                const p1 = battle.players[0];
                const p2 = battle.players[1];
                
                if (p1.score > p2.score) battle.winner = p1.userId;
                else if (p2.score > p1.score) battle.winner = p2.userId;

                await battle.save();

                io.to(battle.roomID).emit('battle:ended', {
                    winnerId: battle.winner,
                    finalScores: battle.players.map(p => ({ name: p.name, score: p.score }))
                });
            } else {
                await battle.save();
            }

        } catch (err) {
            logger.error('[BATTLE] Submit Error:', err);
        }
    });

    // --- 4. Anti-Cheat: Forfeit on Tab Switch ---
    socket.on('battle:tab_switch', async (data) => {
        const { battleId } = data;
        const battle = await Battle.findById(battleId);
        if (!battle || battle.status !== 'active') return;

        const loser = battle.players.find(p => p.userId.toString() === socket.user._id.toString());
        const winner = battle.players.find(p => p.userId.toString() !== socket.user._id.toString());

        battle.status = 'completed';
        battle.winner = winner.userId;
        await battle.save();

        io.to(battle.roomID).emit('battle:ended', {
            winnerId: winner.userId,
            reason: 'Opponent disqualified for cheating (tab switch)',
            finalScores: battle.players.map(p => ({ name: p.name, score: p.score }))
        });
        
        logger.warn(`🚫 [BATTLE] ${socket.user.name} forfeited due to tab switch`);
    });

    // Handle Clean disconnect
    socket.on('disconnect', () => {
        waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
    });
};
