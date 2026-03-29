import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { toast } from 'react-hot-toast';
import { 
    FiZap, FiUsers, FiAward, FiAlertCircle, 
    FiShield, FiTrendingUp, FiCheckCircle, FiXCircle,
    FiSearch, FiLayers, FiClock, FiCopy
} from 'react-icons/fi';
import './SurvivalArena.css';

const SurvivalArena = () => {
    const { socket, connected } = useSocket();
    const { user } = useAuth();
    const navigate = useNavigate();

    // -- Authentication Helper --
    const myId = useMemo(() => {
        const id = user?.id || user?._id;
        return id ? id.toString() : null;
    }, [user]);

    // -- Game State --
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
    const [pinInput, setPinInput] = useState('');
    const [configTopic, setConfigTopic] = useState('General');
    const [configQuestions, setConfigQuestions] = useState(10);

    const timerRef = useRef(null);
    const myAnswerRef = useRef(null);
    const isEliminatedRef = useRef(false);

    // Sync refs
    useEffect(() => { myAnswerRef.current = myAnswer; }, [myAnswer]);
    useEffect(() => { isEliminatedRef.current = isEliminated; }, [isEliminated]);

    // -- Actions --
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

    const handleCreateRoom = () => {
        socket.emit('survival:create', { 
            topic: configTopic, 
            difficulty: 'mixed',
            maxQuestions: configQuestions 
        });
    };

    const handleJoinByPin = () => {
        if (!pinInput || pinInput.length !== 6) {
            toast.error('Please enter a valid 6-digit PIN');
            return;
        }
        socket.emit('survival:join_by_pin', { pin: pinInput });
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
        if (timerRef.current) clearInterval(timerRef.current);
        let time = duration;
        setTimeLeft(time);
        
        timerRef.current = setInterval(() => {
            time -= 1;
            setTimeLeft(time);
            if (time <= 0) {
                if (timerRef.current) clearInterval(timerRef.current);
                if (!myAnswerRef.current && !isEliminatedRef.current) {
                   handleSubmitAnswer(null);
                }
            }
        }, 1000);
    }, [handleSubmitAnswer]);

    // -- Socket Connections --
    useEffect(() => {
        if (!socket || !connected) return;

        socket.on('survival:rooms_list', setAvailableRooms);
        socket.on('survival:created', (data) => {
            setRoomState(data);
            setView('preparing');
            toast.success('Battle room ready!');
        });

        socket.on('survival:pin_resolved', (data) => {
            handleJoinRoom(data.roomId);
        });

        socket.on('survival:room_state', setRoomState);
        socket.on('survival:player_joined', (data) => {
            setRoomState(prev => prev ? { ...prev, players: data.players } : null);
        });
        socket.on('survival:room_state', (data) => {
            setRoomState(data);
            if (data.status === 'active') setView('preparing');
        });

        socket.on('survival:game_starting', () => {
            setView('preparing');
            toast.success('Survival Commencing!', { icon: '🔥' });
        });

        socket.on('survival:preparing_question', () => {
            setRoundResult(null);
            setMyAnswer(null);
            setIsSubmitting(false);
            if (!isEliminatedRef.current) setView('playing');
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

        socket.on('survival:error', (data) => {
            toast.error(data.message || 'Battle failure');
        });

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
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [socket, connected, startTimer]);

    // -- Helpers --
    const timerPercent = timerDuration > 0 ? (timeLeft / timerDuration) * 100 : 0;
    const timerColor = timeLeft <= 5 ? '#EF4444' : timeLeft <= 10 ? '#F59E0B' : '#10B981';

    // -- Views --
    if (view === 'configure') {
        return (
            <div className="survival-arena-root">
                <div className="survival-config-card glass animate-fadeIn">
                    <FiLayers className="config-icon" />
                    <h2>Setup Survival Room</h2>
                    <p>Customize your private arena rules</p>
                    
                    <div className="config-form">
                        <div className="form-group">
                            <label>Battle Topic</label>
                            <select value={configTopic} onChange={(e) => setConfigTopic(e.target.value)}>
                                <option value="General">General / mixed</option>
                                <option value="Python">Python</option>
                                <option value="Java">Java</option>
                                <option value="JavaScript">JavaScript</option>
                                <option value="Data Structures">Data Structures</option>
                                <option value="Algorithms">Algorithms</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Total Questions ({configQuestions})</label>
                            <input 
                                type="range" 
                                min="5" 
                                max="50" 
                                step="5" 
                                value={configQuestions} 
                                onChange={(e) => setConfigQuestions(parseInt(e.target.value))} 
                                className="range-slider"
                            />
                        </div>
                        
                        <div className="config-actions">
                            <button className="btn-cancel" onClick={() => setView('lobby')}>Cancel</button>
                            <button className="btn-launch" onClick={handleCreateRoom}>Generate PIN</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    if (view === 'lobby') {
        return (
            <div className="survival-arena-root">
                <div className="survival-lobby animate-fadeIn">
                    <header className="lobby-header">
                        <div className="header-desc">
                            <h1>Survival Mode</h1>
                            <p>One wrong answer = Elimination. Last person standing wins!</p>
                        </div>
                        <div className="header-actions">
                            <button className="btn-create" onClick={() => setView('configure')}>
                                <FiZap /> Setup Private Arena
                            </button>
                        </div>
                    </header>

                    <div className="pin-join-section glass">
                        <div className="pin-input-group">
                            <FiShield />
                            <input 
                                type="text" 
                                placeholder="Enter 6-digit Match PIN" 
                                value={pinInput}
                                maxLength={6}
                                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                            />
                        </div>
                        <button className="btn-join-pin" onClick={handleJoinByPin}>Quick Join PIN</button>
                    </div>

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
            </div>
        );
    }

    if (view === 'preparing') {
        return (
            <div className="survival-arena-root">
                <div className="survival-preparing animate-fadeIn">
                    <div className="preparing-card glass">
                        {roomState?.pin && (
                           <div className="match-pin-banner">
                               <div className="pin-info">
                                   <span className="label">ENTRY PIN</span>
                                   <strong className="pin-code">{roomState.pin}</strong>
                               </div>
                               <button className="btn-copy-pin" onClick={() => {
                                   navigator.clipboard.writeText(roomState.pin);
                                   toast.success('PIN copied to clipboard!');
                               }}>
                                   <FiCopy /> Copy
                               </button>
                           </div>
                        )}
                        <FiZap className="pulse-icon" />
                        <h1>Entry Portal Active</h1>
                        <div className="room-summary">
                            <div className="summary-item">
                                <label>Topic</label>
                                <strong>{roomState?.topic}</strong>
                            </div>
                            <div className="summary-item">
                                <label>Target</label>
                                <strong>{roomState?.maxQuestions} Questions</strong>
                            </div>
                        </div>
                        <div className="survivors-list">
                            <h3>Synchronized Survivors ({roomState?.players?.length || 0})</h3>
                            <div className="p-grid">
                                {roomState?.players?.map(p => (
                                    <div key={p.userId} className="p-chip animate-slideDown">
                                        <img src={p.avatar} alt={p.name} />
                                        <span>{p.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        <p className="status-note">
                            {roomState?.host === myId 
                                ? 'You are the host. Start when others have joined!' 
                                : 'Vanguard sync in progress.. Waiting for host.'}
                        </p>
                        
                        {roomState?.host === myId ? (
                            <div className="prep-actions">
                                <button className="btn-start-now" onClick={handleStartGame}>INITIATE BATTLE</button>
                                <button className="btn-abort" onClick={() => setView('lobby')}>CLOSE ROOM</button>
                            </div>
                        ) : (
                            <button className="btn-abort" onClick={() => setView('lobby')}>LEAVE PORTAL</button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'playing') {
        return (
            <div className="survival-arena-root">
                <div className="survival-playing animate-scaleIn">
                    <div className="survival-hud glass">
                        <div className="round-count">ROUND {currentQuestion?.questionNumber || 1}</div>
                        <div className="alive-count"><FiUsers /> {currentQuestion?.aliveCount || 0} ALIVE</div>
                    </div>
                    <main className="question-zone glass">
                        <div className="timer-bar-wrap">
                            <div className="timer-meta">
                                <span style={{ color: timerColor }}>{timeLeft}s</span>
                                <span className="topic-tag">{currentQuestion?.topic}</span>
                            </div>
                            <div className="timer-track">
                                <div className="timer-fill" style={{ width: `${timerPercent}%`, background: timerColor }} />
                            </div>
                        </div>
                        <h2 className="q-text">{currentQuestion?.question}</h2>
                        <div className="options-grid">
                            {currentQuestion?.options.map((opt, i) => {
                                const isSelected = myAnswer === opt;
                                const isCorrect = roundResult && opt === roundResult.correctAnswer;
                                const isWrong = roundResult && isSelected && !roundResult.isCorrect;
                                return (
                                    <button 
                                        key={opt}
                                        className={`opt-btn ${isSelected ? 'selected' : ''} ${isCorrect ? 'correct' : ''} ${isWrong ? 'wrong' : ''}`}
                                        onClick={() => !isSubmitting && handleSubmitAnswer(opt)}
                                        disabled={isSubmitting || roundResult}
                                    >
                                        <span className="opt-marker">{String.fromCharCode(65 + i)}</span>
                                        <span className="opt-label">{opt}</span>
                                        {isCorrect && <FiCheckCircle className="res-icon" />}
                                        {isWrong && <FiXCircle className="res-icon" />}
                                    </button>
                                );
                            })}
                        </div>
                    </main>
                    <aside className="survival-sidebar glass">
                        <h3>Live Leaderboard</h3>
                        <div className="scores-list">
                            {scores.map(s => (
                                <div key={s.userId} className={`score-row ${!s.isAlive ? 'eliminated' : ''} ${s.userId === myId ? 'me' : ''}`}>
                                    <span className="rank">#{s.rank}</span>
                                    <span className="name">{s.name}</span>
                                    <span className="pts">{s.score}</span>
                                </div>
                            ))}
                        </div>
                    </aside>
                </div>
            </div>
        );
    }

    if (view === 'eliminated') {
        return (
            <div className="survival-arena-root">
                <div className="survival-eliminated animate-shake">
                    <div className="eliminated-card glass">
                        <FiXCircle className="danger-icon" />
                        <h1>ELIMINATED</h1>
                        <p>One mistake ends the journey. You survived <strong>{finalResults?.personal?.survivalRounds}</strong> rounds.</p>
                        <div className="stat">
                            <span className="label">Final Score</span>
                            <span className="value">{finalResults?.personal?.finalScore || 0}</span>
                        </div>
                        <button className="btn-spectate" onClick={() => setView('playing')}>Spectate Remainder</button>
                        <button className="btn-exit" onClick={() => navigate('/student/games')}>Exit Arena</button>
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'results') {
        const winner = finalResults?.winner;
        const isMe = winner?.userId === myId;
        return (
            <div className="survival-arena-root">
                <div className="survival-results animate-fadeIn">
                    <div className="results-card glass">
                        <FiAward className="winner-icon" />
                        <h1>{isMe ? 'SURVIVOR SUPREME' : 'ARENA CONCLUDED'}</h1>
                        <p>Winner: <strong>{winner?.name || 'Absolute Stalemate'}</strong></p>
                        <div className="final-lb">
                            <h3>Battle Records</h3>
                            {finalResults?.leaderboard?.slice(0, 10).map(s => (
                                <div key={s.userId} className={`lb-row ${s.userId === myId ? 'me' : ''}`}>
                                    <span className="rank">#{s.rank}</span>
                                    <span className="name">{s.name}</span>
                                    <span className="rounds">{s.survivalRounds} Rounds</span>
                                    <span className="score">{s.score} pts</span>
                                </div>
                            ))}
                        </div>
                        <div className="actions">
                            <button className="btn-again" onClick={() => window.location.reload()}>Re-Enter Portal</button>
                            <button className="btn-exit" onClick={() => navigate('/student/games')}>Main Hub</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};

export default SurvivalArena;
