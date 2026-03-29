import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { toast } from 'react-hot-toast';
import { 
    FiZap, FiUsers, FiAward, FiAlertCircle, 
    FiShield, FiTrendingUp, FiCheckCircle, FiXCircle,
    FiSearch, FiLayers, FiClock, FiCopy, FiFileText, FiBookOpen,
    FiUploadCloud, FiArrowRight, FiTarget
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
    
    // -- Enhanced Config States --
    const [configTitle, setConfigTitle] = useState('');
    const [configDescription, setConfigDescription] = useState('');
    const [configTopic, setConfigTopic] = useState('');
    const [configContent, setConfigContent] = useState('');
    const [configSource, setConfigSource] = useState('topic'); // 'topic' | 'text' | 'pdf'
    const [configMaxPlayers, setConfigMaxPlayers] = useState(50);
    const [configDifficulty, setConfigDifficulty] = useState('medium');
    const [isCreating, setIsCreating] = useState(false);
    const creationRef = useRef(null); // track current creation attempt

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
        if (!socket?.connected) return toast.error('Check your internet connection!');
        if (!configTitle) return toast.error('Please enter a game title');
        if (configSource === 'topic' && !configTopic) return toast.error('Enter a topic keyword');
        if (configSource === 'text' && !configContent) return toast.error('Paste some content');

        setIsCreating(true); 
        const attemptId = Date.now();
        creationRef.current = attemptId;

        // DECLARE finalMax here
        const finalMax = Math.min(75, Math.max(2, parseInt(configMaxPlayers) || 10));

        socket.emit('survival:create', { 
            title: configTitle,
            description: configDescription,
            topic: configSource === 'topic' ? configTopic : (configTitle || 'Custom Content'),
            content: configSource === 'text' ? configContent : null,
            difficulty: configDifficulty,
            maxQuestions: 5,
            maxPlayers: finalMax
        });

        // SAFETY TIMEOUT (if server doesn't respond in 15s)
        setTimeout(() => {
            if (creationRef.current === attemptId) {
                setIsCreating(false);
                creationRef.current = null;
                toast.error('Match creation timed out. Please try again.');
            }
        }, 15000);
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
            console.log("🚀 [SURVIVAL] Initiating Battle Protocol...");
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
            console.log("📡 [SURVIVAL] Match Successfully Created:", data);
            creationRef.current = null; // Clear pending
            setRoomState(data);
            setView('preparing');
            setIsCreating(false);
            toast.success(`Arena Generated! PIN: ${data.pin}`);
        });

        socket.on('survival:error', (error) => {
            console.error("❌ [SURVIVAL] Match Creation Error:", error);
            creationRef.current = null; // Clear pending
            setIsCreating(false);
            toast.error(error.message || 'Battle setup failed');
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
            console.log("🏁 [SURVIVAL] Match Initiated by Host!");
            setView('playing'); // Force move to battle zone!
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

        socket.on('connect', () => {
            console.log("📡 [SURVIVAL] Connection restored - refreshing room list...");
            socket.emit('survival:get_rooms');
        });

        socket.emit('survival:get_rooms');
        const fetchInterval = setInterval(() => {
            if (socket.connected) {
                socket.emit('survival:get_rooms');
            }
        }, 3000); // Poll every 3 seconds

        return () => {
            socket.off('connect');
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

    // -- Progress & Aesthetics --
    const finalMax = timerDuration || 20; 
    const timerPercent = finalMax > 0 ? (timeLeft / finalMax) * 100 : 0;
    const timerColor = timeLeft <= 5 ? '#EF4444' : timeLeft <= 10 ? '#F59E0B' : '#10B981';

    // -- Views --
    if (view === 'configure') {
        return (
            <div className="survival-arena-root">
                <div className="survival-config-card glass animate-fadeIn wide-config">
                    <FiLayers className="config-icon" />
                    <h2>Launch Survival Arena</h2>
                    <p>Setup a 5-round elimination battle</p>
                    
                    <div className="config-form scroll-form">
                        <div className="form-row">
                            <div className="form-group">
                                <label>Match Title</label>
                                <input type="text" placeholder="e.g., Python Masters" value={configTitle} onChange={e => setConfigTitle(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Participation Pool (2-75)</label>
                                <input 
                                    type="number" 
                                    min="2" 
                                    max="75" 
                                    value={configMaxPlayers} 
                                    onChange={e => setConfigMaxPlayers(e.target.value)} 
                                    onBlur={() => {
                                        let val = parseInt(configMaxPlayers) || 2;
                                        if (val < 2) val = 2;
                                        if (val > 75) val = 75;
                                        setConfigMaxPlayers(val);
                                    }}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Description</label>
                            <textarea placeholder="Tell players what this match is about..." value={configDescription} onChange={e => setConfigDescription(e.target.value)} rows="2" />
                        </div>

                        <div className="source-tabs">
                            <button className={configSource === 'topic' ? 'active' : ''} onClick={() => setConfigSource('topic')}><FiSearch /> Topic</button>
                            <button className={configSource === 'text' ? 'active' : ''} onClick={() => setConfigSource('text')}><FiFileText /> Paste Text</button>
                            <button className={configSource === 'pdf' ? 'active' : ''} onClick={() => setConfigSource('pdf')}><FiBookOpen /> PDF</button>
                        </div>

                        {configSource === 'topic' && (
                            <div className="form-group animate-slideDown">
                                <label>Topic Keyword</label>
                                <input type="text" placeholder="e.g., Photosynthesis" value={configTopic} onChange={e => setConfigTopic(e.target.value)} />
                            </div>
                        )}

                        {configSource === 'text' && (
                            <div className="form-group animate-slideDown">
                                <label>Paste Content</label>
                                <textarea placeholder="Paste text here... Gemini will generate questions from it." value={configContent} onChange={e => setConfigContent(e.target.value)} rows="4" />
                            </div>
                        )}

                        {configSource === 'pdf' && (
                            <div className="pdf-upload-hint animate-slideDown">
                                <FiUploadCloud />
                                <p>Upload PDF feature coming soon! Use Paste Text for now.</p>
                            </div>
                        )}
                        
                        <div className="form-row">
                            <div className="form-group">
                                <label>Difficulty</label>
                                <select value={configDifficulty} onChange={e => setConfigDifficulty(e.target.value)}>
                                    <option value="easy">Easy (Fundamentals)</option>
                                    <option value="medium">Medium (Standard)</option>
                                    <option value="hard">Hard (Competitive)</option>
                                </select>
                            </div>
                            <div className="form-group rounds-locked">
                                <label>Rounds</label>
                                <div className="locked-badge">5 FIXED</div>
                            </div>
                        </div>
                        
                        <div className="config-actions">
                            <button className="btn-cancel" onClick={() => setView('lobby')}>Back</button>
                            <button 
                                className={`btn-launch ${isCreating ? 'loading' : ''}`} 
                                onClick={handleCreateRoom} 
                                disabled={isCreating}
                            >
                                {isCreating ? 'GENERATING PORTAL...' : 'GENERATE MATCH PIN'}
                            </button>
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
                                        <div key={room.roomId} className="room-card glass animate-slideDown">
                                            <div className="room-info">
                                                <h3 className="room-title">{room.title || room.topic}</h3>
                                                <span className="room-topic-mini">{room.topic}</span>
                                                <span className="host-name">Host: {room.hostName}</span>
                                                <div className="room-tags">
                                                    <span className={`difficulty ${room.difficulty}`}>{room.difficulty}</span>
                                                    <span className="players"><FiUsers /> {room.playerCount} / {room.maxPlayers}</span>
                                                </div>
                                            </div>
                                            <div className="pin-required-badge">
                                                <FiShield /> PIN Required
                                            </div>
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
                           <div className="match-pin-banner pulse-border">
                               <div className="pin-info">
                                   <span className="label">PORTAL ACCESS PIN</span>
                                   <strong className="pin-code">{roomState.pin}</strong>
                               </div>
                               <button className="btn-copy-pin" onClick={() => {
                                   navigator.clipboard.writeText(roomState.pin);
                                   toast.success('Access PIN copied!');
                               }}>
                                   <FiCopy /> Copy
                               </button>
                           </div>
                        )}
                        <div className="preparing-header">
                            <FiZap className="pulse-icon-small" />
                            <h1>{roomState?.title || 'Survival Arena'}</h1>
                            <p>{roomState?.description}</p>
                        </div>

                        <div className="portal-stats glass">
                            <div className="portal-stat">
                                <span className="label">TOPIC</span>
                                <span className="value">{roomState?.topic}</span>
                            </div>
                            <div className="portal-stat">
                                <span className="label">SURVIVORS</span>
                                <span className="value">{roomState?.players?.length} / {roomState?.maxPlayers}</span>
                            </div>
                            <div className="portal-stat">
                                <span className="label">PROTOCOL</span>
                                <span className="value">5 ROUNDS</span>
                            </div>
                        </div>

                        <div className="roster-section">
                            <h3>Currently Synchronized:</h3>
                            <div className="survivor-pills">
                                {roomState?.players?.map(p => (
                                    <div key={p.userId} className="survivor-pill animate-slideDown">
                                        <img src={p.avatar} alt="Avatar" />
                                        <span>{p.name} {p.userId === myId ? '(You)' : ''}</span>
                                        {p.userId === roomState.host && <FiTarget className="host-indicator" title="Match Host" />}
                                    </div>
                                ))}
                                {(!roomState?.players || roomState.players.length === 0) && (
                                    <div className="waiting-pill">Calibrating sensors...</div>
                                )}
                            </div>
                        </div>
                        
                        <div className="preparing-actions">
                            {roomState?.host === myId ? (
                                <>
                                    <button className="btn-ignite" onClick={handleStartGame}>INITIATE BATTLE PROTOCOL</button>
                                    <button className="btn-abort-match" onClick={() => setView('lobby')}>DISMANTLE ROOM</button>
                                </>
                            ) : (
                                <div className="waiting-for-host">
                                    <div className="loader-ring"></div>
                                    <span>Standby: Awaiting Host Initiation...</span>
                                    <button className="btn-leave-portal" onClick={() => setView('lobby')}>Exit Portal</button>
                                </div>
                            )}
                        </div>
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
