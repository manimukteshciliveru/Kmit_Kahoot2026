const Battle = require('../models/Battle');
const Quiz = require('../models/Quiz');
const User = require('../models/User');
const logger = require('../utils/logger');
const { calculateScore } = require('../utils/calculateScore');
const rankManager = require('../utils/rankManager');
const battleAIService = require('../services/battleAI.service');

// Matchmaking State
let waitingPlayers = new Map();

module.exports = (io, socket) => {
    
    const broadcastLobbyUpdate = () => {
        const lobby = Array.from(waitingPlayers.values()).map(p => ({
            userId: p.userId,
            name: p.name,
            avatar: p.avatar,
            socketId: p.socketId, // For legacy frontend compatibility
            mode: p.mode,
            rank: p.rank
        }));
        io.emit('battle:lobby_update', lobby);
    };

    const createBattle = async (p1, p2, topicStr = null) => {
        const roomID = `battle_${Date.now()}_${p1.userId}`;
        
        let quiz;
        if (topicStr && topicStr.includes(':')) {
            const [cat, sub] = topicStr.split(':').map(s => s.trim());
            quiz = await battleAIService.generateBattleQuiz(cat, sub);
        } else {
            quiz = await Quiz.findOne({ status: 'live' }).select('_id title questions settings');
        }

        if (!quiz) {
            io.to(p1.socketId).emit('error', { message: 'Battle arena currently empty (No Quizzes)' });
            io.to(p2.socketId).emit('error', { message: 'Battle arena currently empty (No Quizzes)' });
            return null;
        }

        const newBattle = new Battle({
            roomID,
            quizId: quiz._id,
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
                title: quiz.title,
                questions: quiz.questions,
                settings: quiz.settings
            },
            players: newBattle.players
        });
    };

    // --- Lobby ---
    socket.on('battle:enter_lobby', (data) => {
        const userId = socket.user._id.toString();
        const mode = data?.mode || 'random';
        
        waitingPlayers.set(userId, {
            userId: userId,
            name: socket.user.name,
            avatar: socket.user.avatar,
            socketId: socket.id,
            mode: mode,
            rank: socket.user.rank || { tier: 'Bronze', level: 1, points: 0 },
            joinedAt: Date.now()
        });

        if (mode === 'random') {
            const opponent = Array.from(waitingPlayers.values()).find(p => 
                p.userId !== userId && p.mode === 'random'
            );

            if (opponent) {
                createBattle(opponent, waitingPlayers.get(userId));
            } else {
                socket.emit('battle:searching');
                setTimeout(() => {
                    const me = waitingPlayers.get(userId);
                    if (me && me.mode === 'random' && me.socketId === socket.id) {
                        socket.emit('battle:no_players', { message: 'Quick match timed out. Try browsing for players instead.' });
                        waitingPlayers.delete(userId);
                        broadcastLobbyUpdate();
                    }
                }, 40000);
            }
        }
        broadcastLobbyUpdate();
    });

    // --- Direct Challenges ---
    socket.on('battle:challenge_player', (data) => {
        const { targetUserId, topic } = data;
        const challenger = waitingPlayers.get(socket.user._id.toString());
        const target = waitingPlayers.get(targetUserId);

        if (!target) return socket.emit('error', { message: 'Target is no longer in the lobby.' });
        if (target.userId === challenger.userId) return socket.emit('error', { message: "Internal Error: Cannot duel yourself." });

        console.log(`⚔️ [BATTLE] Challenge: ${challenger.name} -> ${target.name}`);
        io.to(target.socketId).emit('battle:incoming_challenge', {
            challengerName: challenger.name,
            challengerUserId: challenger.userId,
            topic: topic || 'General'
        });
    });

    socket.on('battle:respond_challenge', (data) => {
        const { challengerUserId, accept, topic } = data;
        const challenger = waitingPlayers.get(challengerUserId);
        const target = waitingPlayers.get(socket.user._id.toString());

        if (!challenger) {
            return socket.emit('error', { message: 'Challenger has left the arena.' });
        }
        if (!target) return;

        if (accept) {
            createBattle(challenger, target, topic);
        } else {
            io.to(challenger.socketId).emit('battle:challenge_rejected', { message: 'Opponent declined the invitation.' });
        }
    });

    socket.on('battle:submit_answer', async (data) => {
        const { battleId, questionIndex, answer, timeTaken } = data;
        try {
            const battle = await Battle.findById(battleId).populate('quizId');
            if (!battle || battle.status !== 'active') return;

            const playerIdx = battle.players.findIndex(p => p.userId.toString() === socket.user._id.toString());
            const opponentIdx = battle.players.findIndex(p => p.userId.toString() !== socket.user._id.toString());
            
            const player = battle.players[playerIdx];
            const opponent = battle.players[opponentIdx];

            const question = battle.quizId.questions[questionIndex];
            const { isCorrect, scoreAwarded } = calculateScore(question, answer, timeTaken / 1000, battle.quizId.settings);

            player.score += scoreAwarded;
            player.answers.push({ questionIndex, isCorrect, timeSpent: timeTaken });

            socket.emit('battle:score_sync', { newScore: player.score });
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
                let winner, loser;

                if (p1.score > p2.score) { winner = p1; loser = p2; }
                else if (p2.score > p1.score) { winner = p2; loser = p1; }
                else { winner = null; loser = null; } // Draw

                battle.winner = winner ? winner.userId : null;
                await battle.save();

                // --- PROGRESSION LOGIC ---
                if (winner && loser) {
                    const winnerDoc = await User.findById(winner.userId);
                    const loserDoc = await User.findById(loser.userId);

                    if (winnerDoc && loserDoc) {
                        const winPoints = rankManager.calculateRP(true, winnerDoc.rank.points, {
                            correctAnswers: winner.answers.filter(a => a.isCorrect).length,
                            avgTime: winner.answers.reduce((acc, a) => acc + a.timeSpent, 0) / (winner.answers.length * 1000),
                            streak: winnerDoc.rank.winStreak + 1
                        });

                        const lossPoints = rankManager.calculateRP(false, loserDoc.rank.points);

                        // Update Winner
                        winnerDoc.rank.points += winPoints;
                        winnerDoc.rank.winStreak += 1;
                        winnerDoc.rank.totalWins += 1;
                        const wInfo = rankManager.getRankInfo(winnerDoc.rank.points);
                        winnerDoc.rank.tier = wInfo.tier;
                        winnerDoc.rank.level = wInfo.level;
                        await winnerDoc.save();

                        // Update Loser
                        loserDoc.rank.points = Math.max(0, loserDoc.rank.points + lossPoints);
                        loserDoc.rank.winStreak = 0;
                        loserDoc.rank.totalLosses += 1;
                        const lInfo = rankManager.getRankInfo(loserDoc.rank.points);
                        loserDoc.rank.tier = lInfo.tier;
                        loserDoc.rank.level = lInfo.level;
                        await loserDoc.save();

                        io.to(winner.socketId).emit('battle:rank_update', { 
                            change: winPoints, 
                            rank: winnerDoc.rank 
                        });
                        io.to(loser.socketId).emit('battle:rank_update', { 
                            change: lossPoints, 
                            rank: loserDoc.rank 
                        });
                    }
                }

                io.to(battle.roomID).emit('battle:ended', {
                    winnerId: battle.winner,
                    finalScores: battle.players.map(p => ({
                        name: p.name, 
                        score: p.score,
                        userId: p.userId
                    }))
                });
            } else {
                await battle.save();
            }
        } catch (err) { logger.error('Battle Logic Error:', err); }
    });

    socket.on('battle:leave_queue', () => {
        waitingPlayers.delete(socket.id);
        broadcastLobbyUpdate();
        socket.emit('battle:cancelled');
    });

    const handlePlayerExit = async () => {
        const userId = socket.user._id.toString();
        waitingPlayers.delete(userId);
        broadcastLobbyUpdate();

        // Check if player was in an active battle
        try {
            const activeBattle = await Battle.findOne({
                status: 'active',
                'players.userId': userId
            }).populate('quizId');

            if (activeBattle) {
                activeBattle.status = 'cancelled';
                const opponent = activeBattle.players.find(p => p.socketId !== socket.id);
                
                if (opponent && opponent.socketId) {
                    io.to(opponent.socketId).emit('battle:opponent_left', {
                        message: 'Winner by forfeit! Your opponent has retreated.'
                    });
                    
                    // Award minimum points to the remaining player
                    const user = await User.findById(opponent.userId);
                    if (user) {
                        const winPoints = 15; // Flat forfeit reward
                        user.rank.points += winPoints;
                        user.rank.totalWins += 1;
                        const rInfo = rankManager.getRankInfo(user.rank.points);
                        user.rank.tier = rInfo.tier;
                        user.rank.level = rInfo.level;
                        await user.save();
                        
                        io.to(opponent.socketId).emit('battle:rank_update', {
                            change: winPoints,
                            rank: user.rank
                        });
                    }
                }
                await activeBattle.save();
                io.to(activeBattle.roomID).emit('battle:ended', { status: 'cancelled' });
            }
        } catch (err) {
            logger.error('Exit Logic Error:', err);
        }
    };

    socket.on('battle:leave_battle', handlePlayerExit);

    socket.on('disconnect', handlePlayerExit);
};
