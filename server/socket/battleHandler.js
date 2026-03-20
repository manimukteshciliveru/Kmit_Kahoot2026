const Battle = require('../models/Battle');
const Quiz = require('../models/Quiz');
const User = require('../models/User');
const logger = require('../utils/logger');
const { calculateScore } = require('../utils/calculateScore');

// Matchmaking State
let waitingPlayers = new Map();

module.exports = (io, socket) => {
    
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

    const createBattle = async (p1, p2, topic = null) => {
        const roomID = `battle_${Date.now()}_${p1.userId}`;
        
        let query = { status: 'live' };
        if (topic) {
            query.$or = [
                { title: { $regex: topic, $options: 'i' } },
                { description: { $regex: topic, $options: 'i' } }
            ];
        } else {
            query.isPublic = true;
        }

        let randomQuiz = await Quiz.findOne(query).select('_id title questions settings');
        
        if (!randomQuiz && topic) {
            // Fallback: If topic not found, get any live quiz but warn
            randomQuiz = await Quiz.findOne({ status: 'live', isPublic: true }).select('_id title questions settings');
        }

        if (!randomQuiz) {
            // Ultimate fallback
            randomQuiz = await Quiz.findOne({ 
                status: { $ne: 'draft' },
                'questions.0': { $exists: true } 
            }).select('_id title questions settings');
        }

        if (!randomQuiz) {
            io.to(p1.socketId).emit('error', { message: 'No suitable quizzes found.' });
            io.to(p2.socketId).emit('error', { message: 'No suitable quizzes found.' });
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
        const s1 = io.sockets.sockets.get(p1.socketId);
        const s2 = io.sockets.sockets.get(p2.socketId);
        if (s1) s1.join(roomID);
        if (s2) s2.join(roomID);

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

        logger.info(`⚔️ [BATTLE] Started: ${p1.name} vs ${p2.name} | Topic: ${topic || 'Random'}`);
    };

    // --- Lobby Management ---
    socket.on('battle:enter_lobby', (data) => {
        const mode = data?.mode || 'random';
        waitingPlayers.set(socket.id, {
            userId: socket.user._id.toString(),
            name: socket.user.name,
            avatar: socket.user.avatar,
            socketId: socket.id,
            mode: mode,
            joinedAt: Date.now(),
            votes: null
        });

        logger.info(`👤 [BATTLE] ${socket.user.name} in lobby (${mode})`);
        
        if (mode === 'random') {
            const opponent = Array.from(waitingPlayers.values()).find(p => 
                p.socketId !== socket.id && p.mode === 'random'
            );

            if (opponent) {
                // Random match found - start voting for topic
                const roomID = `vote_${Date.now()}`;
                socket.join(roomID);
                const oppSocket = io.sockets.sockets.get(opponent.socketId);
                if (oppSocket) oppSocket.join(roomID);

                io.to(roomID).emit('battle:topic_voting', {
                    players: [
                        { name: opponent.name, socketId: opponent.socketId },
                        { name: socket.user.name, socketId: socket.id }
                    ]
                });
            } else {
                socket.emit('battle:searching');
                setTimeout(() => {
                    if (waitingPlayers.get(socket.id)?.mode === 'random') {
                        socket.emit('battle:no_players', { message: 'No other players online for Quick Match.' });
                    }
                }, 30000);
            }
        }
        broadcastLobbyUpdate();
    });

    // --- Topic Voting (Random Mode) ---
    socket.on('battle:submit_vote', async (data) => {
        const { opponentSocketId, topic, voteType } = data; // voteType: 'suggest' or 'accept_other'
        const player = waitingPlayers.get(socket.id);
        const opponent = waitingPlayers.get(opponentSocketId);

        if (!player || !opponent) return;

        player.vote = { topic, type: voteType };

        // Check if both voted
        if (opponent.vote) {
            if (opponent.vote.type === 'accept_other' || player.vote.type === 'accept_other') {
                const finalTopic = player.vote.type === 'suggest' ? player.vote.topic : opponent.vote.topic;
                createBattle(player, opponent, finalTopic);
            } else if (player.vote.topic === opponent.vote.topic) {
                createBattle(player, opponent, player.vote.topic);
            } else {
                // Disagreement - ask again or randomized fallback
                socket.emit('battle:vote_conflict', { message: 'Both suggested different topics. Choose one or leave.' });
                io.to(opponentSocketId).emit('battle:vote_conflict', { message: 'Both suggested different topics. Choose one or leave.' });
            }
        }
    });

    // --- Direct Challenges ---
    socket.on('battle:challenge_player', (data) => {
        const { targetSocketId, topic } = data;
        const target = waitingPlayers.get(targetSocketId);
        const challenger = waitingPlayers.get(socket.id);

        if (!target) return socket.emit('error', { message: 'Player left.' });

        io.to(targetSocketId).emit('battle:incoming_challenge', {
            challengerName: challenger.name,
            challengerSocketId: socket.id,
            topic: topic || 'General'
        });
    });

    socket.on('battle:respond_challenge', (data) => {
        const { challengerSocketId, accept, topic } = data;
        const challenger = waitingPlayers.get(challengerSocketId);
        const target = waitingPlayers.get(socket.id);

        if (!challenger || !target) return;

        if (accept) {
            createBattle(challenger, target, topic);
        } else {
            io.to(challengerSocketId).emit('battle:challenge_rejected', { message: 'Invitation rejected' });
        }
    });

    socket.on('battle:leave_queue', () => {
        waitingPlayers.delete(socket.id);
        broadcastLobbyUpdate();
        socket.emit('battle:cancelled');
    });

    socket.on('battle:submit_answer', async (data) => {
        const { battleId, questionIndex, answer, timeTaken } = data;
        try {
            const battle = await Battle.findById(battleId).populate('quizId');
            if (!battle || battle.status !== 'active') return;

            const player = battle.players.find(p => p.userId.toString() === socket.user._id.toString());
            const opponent = battle.players.find(p => p.userId.toString() !== socket.user._id.toString());

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

            if (battle.players.every(p => p.answers.length === battle.quizId.questions.length)) {
                battle.status = 'completed';
                const [p1, p2] = battle.players;
                if (p1.score > p2.score) battle.winner = p1.userId;
                else if (p2.score > p1.score) battle.winner = p2.userId;
                await battle.save();
                io.to(battle.roomID).emit('battle:ended', {
                    winnerId: battle.winner,
                    finalScores: battle.players.map(p => ({ name: p.name, score: p.score }))
                });
            } else await battle.save();
        } catch (err) { logger.error('Battle Submit Error:', err); }
    });

    socket.on('disconnect', () => {
        waitingPlayers.delete(socket.id);
        broadcastLobbyUpdate();
    });
};
