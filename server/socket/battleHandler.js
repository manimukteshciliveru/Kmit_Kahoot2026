const Battle = require('../models/Battle');
const Quiz = require('../models/Quiz');
const User = require('../models/User');
const logger = require('../utils/logger');
const { calculateScore } = require('../utils/calculateScore');

// Matchmaking State
// waitingPlayers is a map of socketId -> player info
let waitingPlayers = new Map();

module.exports = (io, socket) => {
    
    // Helper to get all waiting players (for "Choose" mode)
    const broadcastLobbyUpdate = () => {
        const lobby = Array.from(waitingPlayers.values()).map(p => ({
            userId: p.userId,
            name: p.name,
            avatar: p.avatar,
            socketId: p.socketId,
            mode: p.mode
        }));
        io.emit('battle:lobby_update', lobby);
    };

    // Helper to start a battle between two players
    const createBattle = async (p1, p2) => {
        const roomID = `battle_${Date.now()}_${p1.userId}`;
        
        let randomQuiz = await Quiz.findOne({ isPublic: true, status: 'live' }).select('_id title questions settings');
        if (!randomQuiz) {
            randomQuiz = await Quiz.findOne({ 
                status: { $ne: 'draft' },
                'questions.0': { $exists: true } 
            }).select('_id title questions settings');
        }

        if (!randomQuiz) {
            io.to(p1.socketId).emit('error', { message: 'No play-ready quizzes found.' });
            io.to(p2.socketId).emit('error', { message: 'No play-ready quizzes found.' });
            return null;
        }

        const newBattle = new Battle({
            roomID,
            quizId: randomQuiz._id,
            players: [
                { userId: p1.userId, name: p1.name, socketId: p1.socketId },
                { userId: p2.userId, name: p2.name, socketId: p2.socketId }
            ],
            status: 'active'
        });

        await newBattle.save();

        // Join both sockets to room
        const s1 = io.sockets.sockets.get(p1.socketId);
        const s2 = io.sockets.sockets.get(p2.socketId);
        if (s1) s1.join(roomID);
        if (s2) s2.join(roomID);

        // Remove from waiting map
        waitingPlayers.delete(p1.socketId);
        waitingPlayers.delete(p2.socketId);
        broadcastLobbyUpdate();

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

        logger.info(`⚔️ [BATTLE] Match started: ${p1.name} vs ${p2.name}`);
        return newBattle;
    };

    // --- 1. Enter Lobby ---
    socket.on('battle:enter_lobby', (data) => {
        const mode = data?.mode || 'random'; // 'random' or 'choose'
        
        waitingPlayers.set(socket.id, {
            userId: socket.user._id.toString(),
            name: socket.user.name,
            avatar: socket.user.avatar,
            socketId: socket.id,
            mode: mode,
            joinedAt: Date.now()
        });

        logger.info(`👤 [BATTLE] ${socket.user.name} entered lobby (${mode})`);
        
        if (mode === 'random') {
            // Try to find another random player
            const opponent = Array.from(waitingPlayers.values()).find(p => 
                p.socketId !== socket.id && p.mode === 'random'
            );

            if (opponent) {
                createBattle(opponent, waitingPlayers.get(socket.id));
            } else {
                socket.emit('battle:searching');
                // Set a timeout: if no one joins in 30s, notify
                setTimeout(() => {
                    const stillWaiting = waitingPlayers.get(socket.id);
                    if (stillWaiting && stillWaiting.mode === 'random') {
                        socket.emit('battle:no_players', { message: 'No other players online right now. Try again later!' });
                    }
                }, 30000);
            }
        }
        
        broadcastLobbyUpdate();
    });

    // --- 2. Challenge Student ---
    socket.on('battle:challenge_player', (data) => {
        const targetSocketId = data.targetSocketId;
        const targetPlayer = waitingPlayers.get(targetSocketId);
        const challenger = waitingPlayers.get(socket.id);

        if (!targetPlayer || !challenger) {
            return socket.emit('error', { message: 'Player is no longer available.' });
        }

        logger.info(`💌 [BATTLE] ${challenger.name} challenged ${targetPlayer.name}`);

        io.to(targetSocketId).emit('battle:incoming_challenge', {
            challengerId: challenger.userId,
            challengerName: challenger.name,
            challengerSocketId: socket.id
        });
    });

    // --- 3. Accept/Reject Challenge ---
    socket.on('battle:respond_challenge', (data) => {
        const { challengerSocketId, accept } = data;
        const challenger = waitingPlayers.get(challengerSocketId);
        const target = waitingPlayers.get(socket.id);

        if (!challenger || !target) {
            if (accept) socket.emit('error', { message: 'Challenger left the lobby.' });
            return;
        }

        if (accept) {
            createBattle(challenger, target);
        } else {
            logger.info(`❌ [BATTLE] ${target.name} rejected ${challenger.name}`);
            io.to(challengerSocketId).emit('battle:challenge_rejected', {
                message: 'Invitation rejected'
            });
        }
    });

    // --- 4. Leave Lobby ---
    socket.on('battle:leave_queue', () => {
        waitingPlayers.delete(socket.id);
        broadcastLobbyUpdate();
        socket.emit('battle:cancelled');
    });

    // --- 5. Submit Answer ---
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

            if (opponent.socketId) {
                io.to(opponent.socketId).emit('battle:opponent_update', {
                    opponentScore: player.score,
                    questionIndex,
                    isCorrect
                });
            }

            const totalQs = battle.quizId.questions.length;
            const finished = battle.players.every(p => p.answers.length === totalQs);

            if (finished) {
                battle.status = 'completed';
                const [p1, p2] = battle.players;
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
        } catch (err) { logger.error('[BATTLE] Submit Error:', err); }
    });

    // --- 6. Anti-Cheat ---
    socket.on('battle:tab_switch', async (data) => {
        const { battleId } = data;
        const battle = await Battle.findById(battleId);
        if (!battle || battle.status !== 'active') return;

        const winner = battle.players.find(p => p.userId.toString() !== socket.user._id.toString());
        battle.status = 'completed';
        battle.winner = winner.userId;
        await battle.save();

        io.to(battle.roomID).emit('battle:ended', {
            winnerId: winner.userId,
            reason: 'Opponent disqualified for switching tabs',
            finalScores: battle.players.map(p => ({ name: p.name, score: p.score }))
        });
    });

    socket.on('disconnect', () => {
        if (waitingPlayers.has(socket.id)) {
            waitingPlayers.delete(socket.id);
            broadcastLobbyUpdate();
        }
    });
};
