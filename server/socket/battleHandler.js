const User = require('../models/User');
const Battle = require('../models/Battle');
const { generateBattleQuiz } = require('../services/battleAI.service');
const { calculatePoints, getTierByPoints } = require('../utils/rankManager');
const logger = require('../utils/logger');

const waitingPlayers = new Map(); // userId -> player stats

module.exports = (io, socket) => {

    const broadcastLobbyUpdate = () => {
        const lobby = Array.from(waitingPlayers.values()).map(p => ({
            userId: p.userId.toString(),
            name: p.name,
            avatar: p.avatar,
            mode: p.mode,
            topic: p.topic,
            rank: p.rank
        }));
        io.emit('battle:lobby_update', lobby);
    };

    const getSocketsByUserId = (userId) => {
        const sockets = [];
        for (const [id, s] of io.sockets.sockets) {
            if (s.user && s.user._id.toString() === userId) {
                sockets.push(s);
            }
        }
        return sockets;
    };

    const emitToUser = (userId, event, data) => {
        const sockets = getSocketsByUserId(userId);
        sockets.forEach(s => s.emit(event, data));
    };

    const joinUserToRoom = (userId, roomID) => {
        const sockets = getSocketsByUserId(userId);
        sockets.forEach(s => s.join(roomID));
    };

    const createBattle = async (p1, p2, topicStr = null) => {
        const roomID = `battle_${Date.now()}_${p1.userId}`;
        const topic = topicStr || "General";

        try {
            const quizData = await generateBattleQuiz(topic);
            const battleId = `B-${Math.floor(1000 + Math.random() * 9000)}`;

            const newBattle = new Battle({
                battleId: battleId,
                topic: topic,
                roomID: roomID,
                players: [
                    { userId: p1.userId, name: p1.name, socketId: p1.socketId },
                    { userId: p2.userId, name: p2.name, socketId: p2.socketId }
                ],
                quizId: quizData
            });

            await newBattle.save();
            
            joinUserToRoom(p1.userId, roomID);
            joinUserToRoom(p2.userId, roomID);

            waitingPlayers.delete(p1.userId);
            waitingPlayers.delete(p2.userId);
            broadcastLobbyUpdate();

            io.to(roomID).emit('battle:started', {
                battleId: battleId,
                roomID: roomID,
                players: newBattle.players,
                quiz: quizData
            });

            logger.info(`⚔️ [BATTLE] Combat Initiated: ${p1.name} vs ${p2.name} in Room ${roomID}`);
        } catch (error) {
            logger.error('Create Battle Error:', error);
            emitToUser(p1.userId, 'error', { message: 'Battle generation failed.' });
            emitToUser(p2.userId, 'error', { message: 'Battle generation failed.' });
        }
    };

    // --- Lobby ---
    socket.on('battle:enter_lobby', (data) => {
        const userId = socket.user._id.toString();
        const mode = data?.mode || 'random';
        const topicRaw = data?.topic || 'General';
        const topic = topicRaw.toLowerCase().replace(/\s+/g, ''); // Normalize
        
        waitingPlayers.set(userId, {
            userId: userId,
            name: socket.user.name,
            avatar: socket.user.avatar,
            socketId: socket.id,
            mode: mode,
            topic: topic,
            rank: socket.user.rank || { tier: 'Bronze', level: 'I', points: 0 },
            joinedAt: Date.now()
        });

        if (mode === 'random') {
            const opponent = Array.from(waitingPlayers.values()).find(p => 
                p.userId !== userId && 
                p.mode === 'random' && 
                p.topic === topic
            );

            if (opponent) {
                createBattle(opponent, waitingPlayers.get(userId), topicRaw);
            } else {
                socket.emit('battle:searching');
            }
        }
        broadcastLobbyUpdate();
    });

    socket.on('battle:challenge_player', async (data) => {
        const { targetUserId, topic } = data;
        const challenger = waitingPlayers.get(socket.user._id.toString());
        const target = waitingPlayers.get(targetUserId);

        if (!target) return socket.emit('error', { message: 'Target is not in the lobby.' });

        emitToUser(targetUserId, 'battle:incoming_challenge', {
            challengerName: challenger.name,
            challengerUserId: challenger.userId,
            topic: topic || 'General'
        });
    });

    socket.on('battle:respond_challenge', async (data) => {
        const { challengerUserId, accept, topic } = data;
        const target = waitingPlayers.get(socket.user._id.toString());
        const challenger = waitingPlayers.get(challengerUserId);

        if (!challenger || !target) return socket.emit('error', { message: 'Duel setup expired.' });

        if (accept) {
            createBattle(challenger, target, topic);
        } else {
            emitToUser(challengerUserId, 'battle:challenge_rejected', { message: 'Opponent declined the invitation.' });
        }
    });

    // --- In-Game (Synchronized Progression) ---
    socket.on('battle:submit_answer', async (data) => {
        const { battleId, questionIndex, answer, timeTaken } = data;
        
        try {
            const battle = await Battle.findOne({ battleId }).populate('players.userId');
            if (!battle || battle.status !== 'active') return;

            const player = battle.players.find(p => p.userId._id.toString() === socket.user._id.toString());
            const opponent = battle.players.find(p => p.userId._id.toString() !== socket.user._id.toString());
            
            if (!player || !opponent) return;
            
            // Avoid double submission for same question
            if (player.answers.some(a => a.questionIndex === questionIndex)) return;

            const question = battle.quizId.questions[questionIndex];
            const isCorrect = (answer !== null && answer === question.correctAnswer);
            const perfectTimeBonus = isCorrect && timeTaken < 3000; 

            // Update Player State for THIS Round
            const roundAnswer = { 
                questionIndex, 
                isCorrect, 
                timeSpent: timeTaken || 15000,
                perfect: perfectTimeBonus
            };
            player.answers.push(roundAnswer);

            // Apply HP Logic (Opponent takes damage if I get it right)
            if (isCorrect) {
                const damage = perfectTimeBonus ? 30 : 20;
                opponent.hp = Math.max(0, opponent.hp - damage);
                player.score += perfectTimeBonus ? 15 : 10;
            } else {
                player.hp = Math.max(0, player.hp - 10); // Mishap damage
            }

            await battle.save();

            // Check if BOTH have answered THIS question
            const opponentAnswer = opponent.answers.find(a => a.questionIndex === questionIndex);

            if (opponentAnswer) {
                // ROUND RESOLVED: Both answered
                const resolution = {
                    questionIndex,
                    correctAnswer: question.correctAnswer,
                    players: battle.players.map(p => {
                        const ans = p.answers.find(a => a.questionIndex === questionIndex);
                        return {
                            userId: p.userId._id.toString(),
                            name: p.name,
                            isCorrect: ans?.isCorrect || false,
                            timeTaken: ans?.timeSpent || 0,
                            hp: p.hp,
                            score: p.score
                        };
                    })
                };

                io.to(battle.roomID).emit('battle:round_resolved', resolution);

                // Wait 3 seconds then signal next question or end
                setTimeout(async () => {
                    const refreshedBattle = await Battle.findOne({ battleId });
                    const knockout = refreshedBattle.players.some(p => p.hp <= 0);
                    const lastQuestion = questionIndex === refreshedBattle.quizId.questions.length - 1;

                    if (knockout || lastQuestion) {
                        await concludeBattle(refreshedBattle);
                    } else {
                        io.to(battle.roomID).emit('battle:next_question', { nextIndex: questionIndex + 1 });
                    }
                }, 4000);

            } else {
                // Only one has answered: Notify the other or tell the current one to wait
                socket.emit('battle:waiting_for_opponent', { questionIndex });
                // We still sync the HP bars live
                io.to(battle.roomID).emit('battle:sync', {
                    players: battle.players.map(p => ({
                        userId: p.userId._id.toString(),
                        hp: p.hp,
                        score: p.score
                    }))
                });
            }

        } catch (err) { logger.error('Battle Sync Error:', err); }
    });

    const concludeBattle = async (battle) => {
        battle.status = 'completed';
        battle.endedAt = new Date();

        const p1 = battle.players[0];
        const p2 = battle.players[1];

        // Determine winner
        let winner, loser;
        if (p1.hp > p2.hp) { winner = p1; loser = p2; }
        else if (p2.hp > p1.hp) { winner = p2; loser = p1; }
        else if (p1.score > p2.score) { winner = p1; loser = p2; }
        else { winner = p2; loser = p1; }

        winner.isWinner = true;
        await battle.save();

        // Points & Streaks Logic
        const winnerUser = await User.findById(winner.userId);
        const loserUser = await User.findById(loser.userId);

        let winPoints = calculatePoints(winnerUser.rank.points, true, winnerUser.rank.winStreak);
        const lossPoints = calculatePoints(loserUser.rank.points, false, loserUser.rank.winStreak);

        // --- Additional Performance Bonuses ---
        // 1. Fast Win Bonus: If average time was low or match ended quickly (Score > 60)
        if (winner.score >= 50) winPoints += 5;
        // 2. Perfect Win Bonus: If winner has 100 HP still
        if (winner.hp === 100) winPoints += 10;

        winnerUser.rank.points += winPoints;
        winnerUser.rank.winStreak += 1;
        winnerUser.rank.totalWins += 1;
        
        loserUser.rank.points = Math.max(0, loserUser.rank.points + lossPoints);
        loserUser.rank.winStreak = 0;
        loserUser.rank.totalLosses += 1;

        // Upgrade Tiers
        const winRank = getTierByPoints(winnerUser.rank.points);
        const lossRank = getTierByPoints(loserUser.rank.points);
        winnerUser.rank.tier = winRank.tier;
        winnerUser.rank.level = winRank.level;
        loserUser.rank.tier = lossRank.tier;
        loserUser.rank.level = lossRank.level;

        await winnerUser.save();
        await loserUser.save();

        io.to(battle.roomID).emit('battle:ended', {
            winner: winner.name,
            results: [
                { userId: winnerUser._id, name: winnerUser.name, rankDelta: winPoints, newPoints: winnerUser.rank.points, tier: winnerUser.rank.tier, lvl: winnerUser.rank.level },
                { userId: loserUser._id, name: loserUser.name, rankDelta: lossPoints, newPoints: loserUser.rank.points, tier: loserUser.rank.tier, lvl: loserUser.rank.level }
            ]
        });

        logger.info(`🏆 [BATTLE END] ${winner.name} won! Delta Win: ${winPoints} | Delta Loss: ${lossPoints}`);
    };

    socket.on('disconnect', async () => {
        const userId = socket.user._id.toString();
        waitingPlayers.delete(userId);
        broadcastLobbyUpdate();

        // Check for active battles to apply AFK penalty
        try {
            const activeBattle = await Battle.findOne({
                status: 'active',
                'players.userId': socket.user._id
            });

            if (activeBattle) {
                const player = activeBattle.players.find(p => p.userId.toString() === userId);
                const opponent = activeBattle.players.find(p => p.userId.toString() !== userId);
                
                player.afk = true;
                player.hp = 0; // Immediate forfeit

                const userModel = await User.findById(userId);
                userModel.rank.points = Math.max(0, userModel.rank.points - 50);
                userModel.rank.winStreak = 0;
                userModel.rank.totalLosses += 1;
                
                const rankData = getTierByPoints(userModel.rank.points);
                userModel.rank.tier = rankData.tier;
                userModel.rank.level = rankData.level;
                
                await userModel.save();
                
                io.to(activeBattle.roomID).emit('battle:opponent_left', {
                    message: `${player.name} has abandoned the field (-50 RP penalty applied).`,
                    winner: opponent.name
                });

                await concludeBattle(activeBattle);
            }
        } catch (err) { logger.error('Disconnect Penalty Error:', err); }
    });
};
