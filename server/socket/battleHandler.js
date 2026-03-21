const User = require('../models/User');
const Battle = require('../models/Battle');
const { generateBattleQuiz } = require('../services/battleAI.service');
const { calculatePoints, getTierByPoints } = require('../utils/rankManager');
const logger = require('../utils/logger');

const waitingPlayers = new Map(); // userId -> player stats
const activeRoundTimers = new Map(); // roomID -> timeout
const pendingQuizCache = new Map(); // topic:count -> Promise
const roomQuestionIndex = new Map(); // roomID -> currentQuestionIndex
const roomRoundStartTime = new Map(); // roomID -> timestamp

module.exports = (io, socket) => {
    if (!socket.user) return;

    const startServerRoundTimer = (roomID, battleId, questionIndex, duration) => {
        if (activeRoundTimers.has(roomID)) {
            clearTimeout(activeRoundTimers.get(roomID));
        }

        const timeout = setTimeout(async () => {
            try {
                const battle = await Battle.findOne({ battleId, status: 'active' });
                if (!battle) return;

                const allAnswered = battle.players.every(p => p.answers.some(a => a.questionIndex === questionIndex));
                if (!allAnswered) {
                    logger.info(`⏰ [BATTLE] Round Timeout in Room ${roomID}. Advancing...`);
                    
                    // Force answers for any player who didn't submit
                    for (const player of battle.players) {
                        const hasAns = player.answers.some(a => a.questionIndex === questionIndex);
                        if (!hasAns) {
                            player.answers.push({
                                questionIndex,
                                isCorrect: false,
                                timeSpent: duration * 1000,
                                perfect: false
                            });
                            player.hp = Math.max(0, player.hp - 10);
                        }
                    }
                    await battle.save();

                    const resolution = {
                        questionIndex,
                        correctAnswer: battle.quiz.questions[questionIndex].correctAnswer,
                        players: battle.players.map(p => ({
                            userId: p.userId.toString(),
                            name: p.name,
                            isCorrect: p.answers.find(a => a.questionIndex === questionIndex)?.isCorrect || false,
                            timeTaken: duration * 1000,
                            hp: p.hp,
                            score: p.score
                        }))
                    };
                    io.to(roomID).emit('battle:round_resolved', resolution);

                    setTimeout(async () => {
                        const b = await Battle.findOne({ battleId });
                        if (!b) return;
                        const lastQuestion = questionIndex === b.quiz.questions.length - 1;
                        if (lastQuestion) await concludeBattle(b);
                        else {
                            io.to(roomID).emit('battle:next_question', { nextIndex: questionIndex + 1, timer: b.questionTimer });
                            startServerRoundTimer(roomID, battleId, questionIndex + 1, b.questionTimer);
                        }
                    }, 4000);
                }
            } catch (err) { logger.error('Round Timeout Error:', err); }
        }, (duration + 5) * 1000);

        activeRoundTimers.set(roomID, timeout);
    };


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

    const createBattle = async (p1, p2, topicStr = null, questionCount = 5, questionTimer = 20, battleTimer = 0) => {
        const roomID = `room_${Date.now()}_${p1.userId.substring(0, 4)}`;
        const topic = topicStr || "General";

        try {
            const quizKey = `${topic}::${questionCount}`;
            let quiz;
            if (pendingQuizCache.has(quizKey)) {
                quiz = await pendingQuizCache.get(quizKey);
                pendingQuizCache.delete(quizKey); // Use once
            } else {
                quiz = await generateBattleQuiz(topic, questionCount);
            }
            const battleId = `btl_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

            const newBattle = new Battle({
                battleId: battleId,
                topic: topic,
                roomID: roomID,
                status: 'active',
                questionTimer: questionTimer,
                battleTimer: battleTimer,
                questionCount: questionCount,
                players: [
                    { userId: p1.userId, name: p1.name },
                    { userId: p2.userId, name: p2.name }
                ],
                quiz: { questions: quiz.questions }
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
                players: newBattle.players.map(p => ({ userId: p.userId.toString(), name: p.name })),
                topic: newBattle.topic,
                questionTimer: newBattle.questionTimer,
                totalQuestions: quiz.questions.length,
                battleTimer: newBattle.battleTimer,
                startTime: Date.now(),
                serverTime: Date.now(), // 🕒 For Clock Sync
                quiz: quiz
            });

            // Start Server Safety Timer for Round 1
            roomQuestionIndex.set(roomID, 0);
            roomRoundStartTime.set(roomID, Date.now());
            startServerRoundTimer(roomID, battleId, 0, newBattle.questionTimer);

            logger.info(`⚔️ [BATTLE] Combat Initiated: ${p1.name} vs ${p2.name} in Room ${roomID}`);

            if (battleTimer > 0) {
                setTimeout(async () => {
                    const b = await Battle.findOne({ battleId });
                    if (b && b.status === 'active') {
                        logger.info(`⏰ [BATTLE] Time Expired for Room ${roomID}`);
                        io.to(roomID).emit('battle:sync', { 
                            message: "Battle time expired! Calculating final results...",
                            timeExpired: true
                        });
                        await concludeBattle(b);
                    }
                }, battleTimer * 1000);
            }
        } catch (error) {
            logger.error('Create Battle Error:', error.message);
            emitToUser(p1.userId, 'error', { 
                message: 'Question generation failed. Please try again in a moment.' 
            });
            emitToUser(p2.userId, 'error', { 
                message: 'Question generation failed. Please try again in a moment.' 
            });
            return;
        }
    };

    // --- Lobby ---
    socket.on('battle:enter_lobby', (data) => {
        const userId = socket.user._id.toString();
        const mode = data?.mode || 'random';
        const topicRaw = data?.topic || 'General';
        const qCount = parseInt(data?.questionCount) || 5;
        const qTimer = parseInt(data?.questionTimer) || 20; 
        const bTimer = parseInt(data?.battleTimer) || 0;
        const topic = topicRaw.toLowerCase().replace(/\s+/g, ''); // Normalize
        
        waitingPlayers.set(userId, {
            userId: userId,
            name: socket.user.name,
            avatar: socket.user.avatar,
            socketId: socket.id,
            mode: mode,
            topic: topic,
            displayTopic: topicRaw,
            questionCount: qCount,
            questionTimer: qTimer,
            battleTimer: bTimer,
            rank: socket.user.rank || { tier: 'Bronze', level: 'I', points: 0 },
            joinedAt: Date.now()
        });

        if (mode === 'random') {
            const opponent = Array.from(waitingPlayers.values()).find(p => 
                p.userId !== userId && 
                p.mode === 'random' && 
                p.topic === topic &&
                p.questionCount === qCount &&
                p.questionTimer === qTimer &&
                p.battleTimer === bTimer
            );

            if (opponent) {
                const quizKey = `${opponent.displayTopic}::${qCount}`;
                if (!pendingQuizCache.has(quizKey)) {
                    pendingQuizCache.set(quizKey, generateBattleQuiz(opponent.displayTopic, qCount));
                }
                createBattle(opponent, waitingPlayers.get(userId), opponent.displayTopic, qCount, qTimer, bTimer);
            } else {
                socket.emit('battle:searching');
            }
        }
        broadcastLobbyUpdate();
    });

    socket.on('battle:challenge_player', async (data) => {
        const { targetUserId, topic, questionCount, questionTimer, battleTimer } = data;
        const challenger = waitingPlayers.get(socket.user._id.toString());
        const target = waitingPlayers.get(targetUserId);

        if (!target) return socket.emit('error', { message: 'Target is not in the lobby.' });

        emitToUser(targetUserId, 'battle:incoming_challenge', {
            challengerName: challenger.name,
            challengerUserId: challenger.userId,
            topic: topic || 'General',
            questionCount: questionCount || 5,
            questionTimer: questionTimer || 20,
            battleTimer: battleTimer || 0
        });
    });

    socket.on('battle:respond_challenge', async (data) => {
        const { challengerUserId, accept, topic, questionCount, questionTimer, battleTimer } = data;
        const target = waitingPlayers.get(socket.user._id.toString());
        const challenger = waitingPlayers.get(challengerUserId);

        if (!challenger || !target) return socket.emit('error', { message: 'Duel setup expired.' });

        if (accept) {
            emitToUser(challengerUserId, 'battle:preparing');
            socket.emit('battle:preparing');
            createBattle(challenger, target, topic, questionCount || 5, questionTimer || 20, battleTimer || 0);
        } else {
            emitToUser(challengerUserId, 'battle:challenge_rejected', { message: 'Opponent declined the invitation.' });
        }
    });

    // --- In-Game (Synchronized Progression) ---
    socket.on('battle:submit_answer', async (data) => {
        const { battleId, questionIndex, answer, timeTaken } = data;
        
        try {
            const battle = await Battle.findOneAndUpdate(
                {
                    battleId,
                    status: 'active',
                    'players': { $elemMatch: {
                        'userId': socket.user._id,
                        'answers.questionIndex': { $ne: questionIndex }
                    }}
                },
                { $set: { updatedAt: new Date() } },
                { new: true }
            ).populate('players.userId');

            if (!battle) return; // duplicate submission blocked atomically

            const myId = socket.user._id.toString();
            const player = battle.players.find(p => p.userId.toString() === myId);
            const opponent = battle.players.find(p => p.userId.toString() !== myId);

            
            if (!player || !opponent) return;

            const question = battle.quiz.questions[questionIndex];
            const isCorrect = (answer !== null && answer === question.correctAnswer);
            const perfectTimeBonus = isCorrect && timeTaken < 3000; 

            // Update Player State for THIS Round
            const roundAnswer = { 
                questionIndex, 
                isCorrect, 
                timeSpent: (timeTaken !== null && timeTaken !== undefined) ? timeTaken : (battle.questionTimer * 1000),
                perfect: perfectTimeBonus
            };
            player.answers.push(roundAnswer);

            const prevHps = battle.players.map(p => p.hp);
            const prevScores = battle.players.map(p => p.score);

            // Apply HP Logic (Opponent takes damage if I get it right)
            if (isCorrect) {
                const damage = perfectTimeBonus ? 30 : 20;
                opponent.hp = Math.max(0, opponent.hp - damage);
                player.score += perfectTimeBonus ? 15 : 10;
            } else {
                player.hp = Math.max(0, player.hp - 10); // Mishap damage
            }

            const hpChanged = battle.players.some((p, i) => p.hp !== prevHps[i]);
            const scoreChanged = battle.players.some((p, i) => p.score !== prevScores[i]);

            await battle.save();

            // 🔥 Race Condition Fix: Fetch FRESH state to see if other player answered
            const freshBattle = await Battle.findOne({ battleId });
            if (!freshBattle) return;

            const freshMe = freshBattle.players.find(p => p.userId.toString() === myId);
            const freshOpp = freshBattle.players.find(p => p.userId.toString() !== myId);
            const opponentAnswer = freshOpp.answers.find(a => a.questionIndex === questionIndex);

            if (opponentAnswer) {
                if (activeRoundTimers.has(battle.roomID)) {
                    clearTimeout(activeRoundTimers.get(battle.roomID));
                    activeRoundTimers.delete(battle.roomID);
                }
                // ROUND RESOLVED: Both answered
                const resolution = {
                    questionIndex,
                    correctAnswer: question.correctAnswer,
                    players: freshBattle.players.map(p => {
                        const ans = p.answers.find(a => a.questionIndex === questionIndex);
                        return {
                            userId: p.userId.toString(),
                            name: p.name,
                            isCorrect: ans?.isCorrect || false,
                            timeTaken: ans?.timeSpent || 0,
                            hp: p.hp,
                            score: p.score
                        };
                    })
                };
                
                io.to(battle.roomID).emit('battle:round_resolved', resolution);

                // 🔥 Gate check: Only one submitter triggers the next round
                const currentStoredIdx = roomQuestionIndex.get(battle.roomID);
                if (currentStoredIdx !== undefined && currentStoredIdx > questionIndex) return;
                
                // Mark round as transitioning
                roomQuestionIndex.set(battle.roomID, questionIndex + 1);

                setTimeout(async () => {
                    const refreshedBattle = await Battle.findOne({ battleId });
                    if (!refreshedBattle) return;
                    const lastQuestion = questionIndex === refreshedBattle.quiz.questions.length - 1;

                    if (lastQuestion) {
                        await concludeBattle(refreshedBattle);
                    } else {
                        roomRoundStartTime.set(battle.roomID, Date.now());
                        io.to(battle.roomID).emit('battle:next_question', { 
                            nextIndex: questionIndex + 1,
                            timer: refreshedBattle.questionTimer,
                            startTime: Date.now(),
                            serverTime: Date.now()
                        });
                        startServerRoundTimer(battle.roomID, battleId, questionIndex + 1, refreshedBattle.questionTimer);
                    }
                }, 1500); // 🕒 Reduced to 1.5s for Low Latency! Compromise for user feedback.

            } else {
                // Only one has answered: Notify the other or tell the current one to wait
                socket.emit('battle:waiting_for_opponent', { questionIndex, opponentName: opponent.name });
                
                if (hpChanged || scoreChanged) {
                    io.to(battle.roomID).emit('battle:sync', {
                        players: freshBattle.players.map(p => ({ // Send from FRESH state
                            userId: p.userId.toString(),
                            name: p.name,
                            hp: p.hp,
                            score: p.score
                        }))
                    });
                }
            }

        } catch (err) { logger.error('Battle Sync Error:', err); }
    });

    socket.on('battle:request_extension', ({ battleId }) => {
        const userId = socket.user._id.toString();
        Battle.findOne({ battleId, status: 'active' }).then(battle => {
            if (!battle) return;
            const opponent = battle.players.find(p => p.userId.toString() !== userId);
            if (opponent) {
                emitToUser(opponent.userId.toString(), 'battle:extension_received', { 
                    requesterName: socket.user.name 
                });
            }
        });
    });

    socket.on('battle:extension_respond', async ({ battleId, accept }) => {
        const userId = socket.user._id.toString();
        const battle = await Battle.findOne({ battleId, status: 'active' });
        if (!battle) return;

        const challenger = battle.players.find(p => p.userId.toString() !== userId);
        if (accept) {
            const currentQ = roomQuestionIndex.get(battle.roomID) || 0;
            const roundStart = roomRoundStartTime.get(battle.roomID) || Date.now();
            const elapsed = Math.floor((Date.now() - roundStart) / 1000);
            const remaining = Math.max(0, battle.questionTimer - elapsed);
            startServerRoundTimer(battle.roomID, battleId, currentQ, remaining + 15);
            io.to(battle.roomID).emit('battle:timer_extended');
        } else {
            if (challenger) {
                emitToUser(challenger.userId.toString(), 'battle:extension_denied');
            }
        }
    });

    const concludeBattle = async (battleInput) => {
        const battle = await Battle.findOne({ battleId: battleInput.battleId });
        if (!battle || battle.status === 'completed') return;

        if (activeRoundTimers.has(battle.roomID)) {
            clearTimeout(activeRoundTimers.get(battle.roomID));
            activeRoundTimers.delete(battle.roomID);
        }
        roomQuestionIndex.delete(battle.roomID);
        battle.status = 'completed';
        battle.endedAt = new Date();

        const p1 = battle.players[0];
        const p2 = battle.players[1];

        // Determine winner
        let winner, loser, isDraw = false;
        if (p1.hp > p2.hp)         { winner = p1; loser = p2; }
        else if (p2.hp > p1.hp)    { winner = p2; loser = p1; }
        else if (p1.score > p2.score) { winner = p1; loser = p2; }
        else if (p2.score > p1.score) { winner = p2; loser = p1; }
        else { isDraw = true; winner = p1; loser = p2; }

        winner.isWinner = true;
        await battle.save();

        // Points & Streaks Logic
        const winnerUser = await User.findById(winner.userId);
        const loserUser = await User.findById(loser.userId);

        // --- Calculate Bonuses for Winner ---
        let winnerBonus = 0;
        if (winnerUser.rank.winStreak >= 5) winnerBonus += 20;
        else if (winnerUser.rank.winStreak >= 3) winnerBonus += 10;
        
        if (winner.score >= 50 && !isDraw) winnerBonus += 5; // Fast Win
        if (winner.hp === 100 && !isDraw) winnerBonus += 10; // Perfect Win

        const baseDrawPts = winner.score > 0 ? 15 : 0;
        const winPoints  = isDraw ? baseDrawPts : calculatePoints(winnerUser.rank.points, loserUser.rank.points, true, winnerBonus);
        const lossPoints = isDraw ? baseDrawPts : calculatePoints(loserUser.rank.points, winnerUser.rank.points, false, 0);

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
            isDraw: isDraw,
            results: [
                { userId: winnerUser._id, name: winnerUser.name, rankDelta: winPoints, newPoints: winnerUser.rank.points, tier: winnerUser.rank.tier, lvl: winnerUser.rank.level },
                { userId: loserUser._id, name: loserUser.name, rankDelta: isDraw ? lossPoints : -Math.abs(lossPoints), newPoints: loserUser.rank.points, tier: loserUser.rank.tier, lvl: loserUser.rank.level }
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

            if (activeBattle && activeBattle.status === 'active') {
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

                const freshBattle = await Battle.findOne({ battleId: activeBattle.battleId });
                await concludeBattle(freshBattle);
            }
        } catch (err) { logger.error('Disconnect Penalty Error:', err); }
    });
};
