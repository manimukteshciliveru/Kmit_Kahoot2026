import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { toast } from 'react-hot-toast';
import { 
    FiZap, FiUsers, FiAward, FiAlertCircle, 
    FiShield, FiTrendingUp, FiCheckCircle, FiXCircle,
    FiSearch, FiTrophy
} from 'react-icons/fi';
import './SurvivalArena.css';

const SurvivalArena = () => {
    const { socket, connected } = useSocket();
    const { user } = useAuth();
    const navigate = useNavigate();

    // ── Game State ─────────────────────────────────────────────
    const [view, setView] = useState('lobby'); // lobby, preparing, playing, eliminated, results
    const [roomState, setRoomState] = useState(null);
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [timerDuration, setTimerDuration] = useState(20);
    const [scores, setScores] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [myAnswer, setMyAnswer] = useState(null);
    const [roundResult, setRoundResult] = useState(null);
    const [isEliminated, setIsEliminated] = useState(false);
    const [finalResults, setFinalResults] = useState(null);
    const [availableRooms, setAvailableRooms] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');

    const timerRef = useRef(null);
    // Refs for real-time state access in intervals
    const myAnswerRef = useRef(null);
    const isEliminatedRef = useRef(isEliminated);

    // Sync refs
    useEffect(() => { myAnswerRef.current = myAnswer; }, [myAnswer]);
    useEffect(() => { isEliminatedRef.current = isEliminated; }, [isEliminated]);

    // ── Actions ────────────────────────────────────────────────
    const handleSubmitAnswer = useCallback((answer) => {
        if (isSubmitting || isEliminatedRef.current) return;
        setMyAnswer(answer);
        setIsSubmitting(true);
        if (roomState?.roomId && currentQuestion?.questionIndex !== undefined) {
            socket.emit('survival:submit_answer', {
                roomId: roomState.roomId,
                answer,
                questionIndex: currentQuestion.questionIndex
            });
        }
    }, [isSubmitting, roomState, currentQuestion, socket]);

    const handleCreateRoom = (topic = 'General', difficulty = 'medium') => {
        socket.emit('survival:create', { topic, difficulty });
    };

    const handleJoinRoom = (roomId) => {
        socket.emit('survival:join', { roomId });
        setView('preparing');
    };

    const handleStartGame = () => {
        if (roomState?.roomId) {
            socket.emit('survival:start', { roomId: roomState.roomId });
        }
    };

    const startTimer = useCallback((duration) => {
        clearInterval(timerRef.current);
        let time = duration;
        setTimeLeft(time);
        
        timerRef.current = setInterval(() => {
            time -= 1;
            setTimeLeft(time);
            if (time <= 0) {
                clearInterval(timerRef.current);
                // Check if user hasn't answered using ref to avoid stale state
                if (!myAnswerRef.current && !isEliminatedRef.current) {
                   handleSubmitAnswer(null);
                }
            }
        }, 1000);
    }, [handleSubmitAnswer]);

    // ── Socket Connections ─────────────────────────────────────
    useEffect(() => {
        if (!socket || !connected) return;

        // Lobby Events
        socket.on('survival:rooms_list', setAvailableRooms);
        socket.on('survival:created', (data) => {
            setView('preparing');
            setRoomState(data);
        });
        socket.on('survival:player_joined', (data) => {
            setRoomState(prev => prev ? { ...prev, players: data.players } : null);
        });
        socket.on('survival:room_state', (data) => {
            setRoomState(data);
            if (data.status === 'active') setView('preparing');
        });

        // Game Flow Events
        socket.on('survival:game_starting', (data) => {
            setView('preparing');
            toast.success('Survival Commencing!', { icon: '🔥' });
        });

        socket.on('survival:preparing_question', (data) => {
            setRoundResult(null);
            setMyAnswer(null);
            setIsSubmitting(false);
            if (!isEliminated) setView('playing');
        });

        socket.on('survival:new_question', (data) => {
            setCurrentQuestion(data);
            setTimerDuration(data.timer);
            setTimeLeft(data.timer);
            startTimer(data.timer);
            setView('playing');
        });

        socket.on('survival:answer_ack', (data) => {
            setRoundResult(data);
        });

        socket.on('survival:score_update', (data) => {
            setScores(data.scores);
        });

        socket.on('survival:round_result', (data) => {
            // End of round results (who survived, who didn't)
            console.log('Round Result:', data);
        });

        socket.on('survival:eliminated', (data) => {
            setIsEliminated(true);
            setView('eliminated');
            setFinalResults(prev => ({ ...prev, personal: data }));
            toast.error('Eliminated!', { icon: '💥' });
        });

        socket.on('survival:game_ended', (data) => {
            setFinalResults(data);
            setView('results');
        });

        // Request initial rooms
        socket.emit('survival:get_rooms');
        const fetchInterval = setInterval(() => {
            socket.emit('survival:get_rooms');
        }, 5000);

        return () => {
            socket.off('survival:rooms_list');
            socket.off('survival:created');
            socket.off('survival:player_joined');
            socket.off('survival:room_state');
            socket.off('survival:game_starting');
            socket.off('survival:preparing_question');
            socket.off('survival:new_question');
            socket.off('survival:answer_ack');
            socket.off('survival:score_update');
            socket.off('survival:round_result');
            socket.off('survival:eliminated');
            socket.off('survival:game_ended');
            clearInterval(fetchInterval);
            clearInterval(timerRef.current);
        };
    }, [socket, connected, isEliminated, startTimer]);

    // ── Helpers ────────────────────────────────────────────────
    const timerPercent = timerDuration > 0 ? (timeLeft / timerDuration) * 100 : 0;
    const timerColor = timeLeft <= 5 ? '#EF4444' : timeLeft <= 10 ? '#F59E0B' : '#10B981';

    // ── Render Components ──────────────────────────────────────

    const renderLobby = () => (
        <div className="survival-lobby animate-fadeIn">
            <header className="lobby-header">
                <div className="header-desc">
                    <h1>Survival Mode</h1>
                    <p>One wrong answer = Elimination. Last person standing wins!</p>
                </div>
                <div className="header-actions">
                    <button className="btn-create" onClick={() => handleCreateRoom('General', 'mixed')}>
                        <FiZap /> Create Entry
                    </button>
                </div>
            </header>

            <div className="room-finder">
                <div className="search-bar">
                    <FiSearch />
                    <input 
                        type="text" 
                        placeholder="Search topics or hosts..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                
                <div className="rooms-grid">
                    {availableRooms.length === 0 ? (
                        <div className="no-rooms">
                            <FiUsers />
                            <p>No active entry points found. Start one yourself!</p>
                        </div>
                    ) : (
                        availableRooms
                            .filter(r => r.topic.toLowerCase().includes(searchQuery.toLowerCase()) || r.hostName.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map(room => (
                                <div key={room.roomId} className="room-card glass">
                                    <div className="room-info">
                                        <h3>{room.topic}</h3>
                                        <span className="host-name">Host: {room.hostName}</span>
                                        <div className="room-tags">
                                            <span className={`difficulty ${room.difficulty}`}>{room.difficulty}</span>
                                            <span className="players"><FiUsers /> {room.playerCount}/50</span>
                                        </div>
                                    </div>
                                    <button className="btn-join" onClick={() => handleJoinRoom(room.roomId)}>Join Battle</button>
                                </div>
                            ))
                    )}
                </div>
            </div>
        </div>
    );

    const renderPreparing = () => (
        <div className="survival-preparing animate-fadeIn">
            <div className="preparing-card glass">
                <FiZap className="pulse-icon" />
                <h2>Entry Portal Active</h2>
                <div className="room-stat-row">
                    <span>Topic: <strong>{roomState?.topic}</strong></span>
                    <span>Diff: <strong>{roomState?.difficulty}</strong></span>
                </div>
                
                <div className="players-list">
                    <h3>Synchronized Survivors ({roomState?.players?.length || 0})</h3>
                    <div className="players-grid-mini">
                        {roomState?.players?.map(p => (
                            <div key={p.userId} className="player-tag">
                                {p.name}
                            </div>
                        ))}
                    </div>
                </div>

                {roomState?.host === (user?.id || user?._id)?.toString() ? (
                    <button className="btn-start-now" onClick={handleStartGame}>
                        IGNITE GAME
                    </button>
                ) : (
                    <p className="waiting-msg">Waiting for host to ignite the arena...</p>
                )}
            </div>
        </div>
    );

    const renderPlaying = () => {
        if (!currentQuestion) return null;
        
        return (
            <div className="survival-playing animate-scaleIn">
                <div className="survival-hud">
                    <div className="hud-part">
                        <span className="round-count">Round {currentQuestion.questionNumber}</span>
                        <span className="alive-count"><FiUsers /> {currentQuestion.aliveCount} Survivors</span>
                    </div>
                </div>

                <div className="question-zone">
                    <div className="timer-bar-wrap">
                        <div className="timer-meta">
                            <span style={{ color: timerColor }}>{timeLeft}s</span>
                            <span className="diff-badge">{currentQuestion.difficulty.toUpperCase()}</span>
                        </div>
                        <div className="timer-track">
                            <div 
                                className="timer-fill" 
                                style={{ width: `${timerPercent}%`, background: timerColor }}
                            />
                        </div>
                    </div>

                    <h2 className="q-text">{currentQuestion.question}</h2>

                    <div className="options-grid">
                        {currentQuestion.options.map((opt, idx) => (
                            <button 
                                key={idx}
                                className={`opt-btn ${myAnswer === opt ? 'selected' : ''} ${roundResult ? (opt === currentQuestion.correctAnswer ? 'correct' : (myAnswer === opt ? 'wrong' : '')) : ''}`}
                                onClick={() => !isSubmitting && handleSubmitAnswer(opt)}
                                disabled={isSubmitting || roundResult}
                            >
                                <span className="opt-marker">{String.fromCharCode(65 + idx)}</span>
                                <span className="opt-label">{opt}</span>
                            </button>
                        ))}
                    </div>

                    {roundResult && (
                        <div className={`round-feedback animate-fadeIn ${roundResult.isCorrect ? 'positive' : 'negative'}`}>
                            {roundResult.isCorrect ? (
                                <><FiCheckCircle /> <span>Precision! You survive another round.</span></>
                            ) : (
                                <><FiShield /> <span>Impact detected. Brace for elimination...</span></>
                            )}
                        </div>
                    )}
                </div>

                <div className="survival-sidebar glass">
                    <h3>Live Leaderboard</h3>
                    <div className="scores-list">
                        {scores.map(s => (
                            <div key={s.userId} className={`score-row ${!s.isAlive ? 'eliminated' : ''} ${s.userId === (user?.id || user?._id)?.toString() ? 'me' : ''}`}>
                                <span className="rank">#{s.rank}</span>
                                <span className="name">{s.name}</span>
                                <span className="pts">{s.score}</span>
                                {!s.isAlive && <FiXCircle className="elim-icon" />}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    const renderEliminated = () => (
        <div className="survival-eliminated animate-shake">
            <div className="eliminated-card glass">
                <FiAlertCircle className="danger-icon" />
                <h1>ELIMINATED</h1>
                <p>One tactical error proved fatal. You survived <strong>{finalResults?.personal?.survivalRounds || 0}</strong> rounds.</p>
                
                <div className="elim-stats">
                    <div className="stat">
                        <span className="label">Final Score</span>
                        <span className="value">{finalResults?.personal?.finalScore || 0}</span>
                    </div>
                </div>

                <button className="btn-spectate" onClick={() => setView('playing')}>Spectate Remainder</button>
                <button className="btn-exit" onClick={() => navigate('/games')}>Exit Arena</button>
            </div>
        </div>
    );

    const renderResults = () => {
        const winner = finalResults?.winner;
        const isMe = winner?.userId === (user?.id || user?._id)?.toString();

        return (
            <div className="survival-results animate-fadeIn">
                <div className="results-card glass">
                    {isMe ? <FiAward className="winner-icon animate-bounce" /> : <FiTrophy className="winner-icon" />}
                    <h1>{isMe ? 'SURVIVOR SUPREME' : 'ARENA CONCLUDED'}</h1>
                    <p>Winner: <strong>{winner?.name || 'Absolute Stalemate'}</strong></p>

                    <div className="final-lb">
                        <h3>Battle Records</h3>
                        {finalResults?.leaderboard?.slice(0, 10).map(s => (
                            <div key={s.userId} className={`lb-row ${s.userId === (user?.id || user?._id)?.toString() ? 'me' : ''}`}>
                                <span className="rank">#{s.rank}</span>
                                <span className="name">{s.name}</span>
                                <span className="rounds">{s.survivalRounds} Rounds</span>
                                <span className="score">{s.score} pts</span>
                            </div>
                        ))}
                    </div>

                    <div className="actions">
                        <button className="btn-again" onClick={() => window.location.reload()}>Re-Enter Portal</button>
                        <button className="btn-exit" onClick={() => navigate('/games')}>Main Hub</button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="survival-arena-root">
            {view === 'lobby' && renderLobby()}
            {view === 'preparing' && renderPreparing()}
                {view === 'playing' && renderPlaying()}
            {view === 'eliminated' && renderEliminated()}
            {view === 'results' && renderResults()}
        </div>
    );
};

export default SurvivalArena;
