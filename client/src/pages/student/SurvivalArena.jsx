import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { toast } from 'react-hot-toast';
import {
    FiZap, FiUsers, FiAward, FiAlertCircle,
    FiShield, FiTrendingUp, FiCheckCircle, FiXCircle,
    FiSearch, FiLayers, FiClock, FiCopy, FiFileText, FiBookOpen,
    FiUploadCloud, FiArrowRight, FiTarget, FiUser, FiStar,
    FiBarChart2, FiSkipForward
} from 'react-icons/fi';
import './SurvivalArena.css';

const SurvivalArena = () => {
    const { socket, connected } = useSocket();
    const { user } = useAuth();
    const navigate = useNavigate();

    // ── States ───────────────────────────────────────────────
    const [view, setView] = useState('lobby');
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
    const [roundIntro, setRoundIntro] = useState(null);

    // Config
    const [configTitle, setConfigTitle] = useState('');
    const [configDescription, setConfigDescription] = useState('');
    const [configTopic, setConfigTopic] = useState('');
    const [configContent, setConfigContent] = useState('');
    const [configSource, setConfigSource] = useState('topic');
    const [configMaxPlayers, setConfigMaxPlayers] = useState(30);
    const [configDifficulty, setConfigDifficulty] = useState('easy');
    const [configRounds, setConfigRounds] = useState(3);
    const [configQPerRound, setConfigQPerRound] = useState(3);
    const [configQMode, setConfigQMode] = useState('decremental'); // 'decremental' | 'equal'
    const [configPdfFile, setConfigPdfFile] = useState(null);
    const [isCreating, setIsCreating] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [answerResult, setAnswerResult] = useState(null); // { isCorrect, correctAnswer, scoreAwarded }

    // ── Refs ─────────────────────────────────────────────────
    const creationTimeoutRef = useRef(null);
    const timerRef = useRef(null);
    const myAnswerRef = useRef(null);
    const isEliminatedRef = useRef(false);

    // ── Memos ────────────────────────────────────────────────
    const myId = useMemo(() => {
        const id = user?.id || user?._id;
        return id ? id.toString() : null;
    }, [user]);

    // Preview questions count for config UI
    const previewQCounts = useMemo(() => {
        const rounds = Math.min(5, Math.max(1, parseInt(configRounds) || 3));
        const base   = Math.min(5, Math.max(1, parseInt(configQPerRound) || 3));
        return Array.from({ length: rounds }, (_, i) =>
            configQMode === 'equal' ? base : Math.max(1, rounds - i)
        );
    }, [configRounds, configQPerRound, configQMode]);

    // ── Submit Answer ────────────────────────────────────────
    const handleSubmitAnswer = useCallback((answer) => {
        if (isSubmitting || isEliminatedRef.current || !roomState?.roomId || currentQuestion === null) return;
        setMyAnswer(answer);
        myAnswerRef.current = answer;
        setIsSubmitting(true);
        socket.emit('survival:submit_answer', {
            roomId: roomState.roomId,
            answer,
            questionIndex: currentQuestion.questionIndex
        });
    }, [isSubmitting, roomState, currentQuestion, socket]);

    const handleSubmitAnswerRef = useRef(handleSubmitAnswer);
    useEffect(() => { handleSubmitAnswerRef.current = handleSubmitAnswer; }, [handleSubmitAnswer]);

    // ── Timer ────────────────────────────────────────────────
    useEffect(() => {
        if (view !== 'playing' || timeLeft <= 0 || myAnswer !== null) {
            if (timerRef.current) clearInterval(timerRef.current);
            return;
        }
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    if (!myAnswerRef.current && !isEliminatedRef.current) {
                        handleSubmitAnswerRef.current(null);
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, [view, timeLeft, myAnswer]);

    // ── Helpers ──────────────────────────────────────────────
    const readFileAsText = (file) => new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.readAsText(file);
    });

    // ── Actions ──────────────────────────────────────────────
    const handleCreateRoom = async () => {
        if (!socket?.connected) return toast.error('Check your internet connection!');
        if (!configTitle) return toast.error('Please enter a game title');
        if (configSource === 'topic' && !configTopic) return toast.error('Enter a topic keyword');
        if (configSource === 'text' && !configContent) return toast.error('Paste some content');
        if (configSource === 'pdf' && !configPdfFile) return toast.error('Please select a PDF file');

        setIsCreating(true);
        let content = null;
        if (configSource === 'text') content = configContent;
        else if (configSource === 'pdf' && configPdfFile) content = await readFileAsText(configPdfFile);

        const finalMax    = Math.min(75, Math.max(2, parseInt(configMaxPlayers) || 30));
        const finalRounds = Math.min(5, Math.max(1, parseInt(configRounds) || 3));
        const finalQPR    = Math.min(5, Math.max(1, parseInt(configQPerRound) || 3));

        socket.emit('survival:create', {
            title: configTitle, description: configDescription,
            topic: configSource === 'topic' ? configTopic : configTitle,
            startDifficulty: configDifficulty,
            maxPlayers: finalMax,
            totalRounds: finalRounds,
            baseQPerRound: finalQPR,
            questionsPerRoundMode: configQMode,
            content
        });

        if (creationTimeoutRef.current) clearTimeout(creationTimeoutRef.current);
        creationTimeoutRef.current = setTimeout(() => {
            setIsCreating(false);
            toast.error('Arena Calibration timed out. Please try again.');
        }, 20000);
    };

    const handleJoinByPin = () => {
        if (!pinInput || pinInput.length !== 6) return toast.error('Enter a valid 6-digit PIN');
        socket.emit('survival:join_by_pin', { pin: pinInput });
    };

    const handleJoinRoom = (roomId) => {
        sessionStorage.setItem('currentSurvivalRoomId', roomId);
        socket.emit('survival:join', { roomId });
        setView('preparing');
    };

    const handleStartGame = () => {
        if (roomState?.roomId && !isStarting) {
            setIsStarting(true);
            socket.emit('survival:start', { roomId: roomState.roomId });
            setTimeout(() => setIsStarting(false), 30000);
        }
    };

    // ── Socket Events ─────────────────────────────────────────
    useEffect(() => {
        if (!socket || !connected) return;

        // Reconnect logic
        const lastRoomId = sessionStorage.getItem('currentSurvivalRoomId');
        if (lastRoomId && view === 'lobby') socket.emit('survival:join', { roomId: lastRoomId });

        socket.emit('survival:get_rooms');

        socket.on('survival:rooms_list', setAvailableRooms);

        socket.on('survival:created', (data) => {
            sessionStorage.setItem('currentSurvivalRoomId', data.roomId);
            if (creationTimeoutRef.current) clearTimeout(creationTimeoutRef.current);
            setRoomState(data);
            setView('preparing');
            setIsCreating(false);
            toast.success(`Arena Ready! PIN: ${data.pin}`, { icon: '⚡' });
        });

        socket.on('survival:error', (error) => {
            if (creationTimeoutRef.current) clearTimeout(creationTimeoutRef.current);
            setIsCreating(false);
            toast.error(error.message || 'Battle setup failed');
        });

        socket.on('survival:pin_resolved', (data) => {
            socket.emit('survival:join', { roomId: data.roomId });
        });

        socket.on('survival:room_state', (data) => {
            sessionStorage.setItem('currentSurvivalRoomId', data.roomId);
            setRoomState(data);
            if (data.status === 'active') setView('preparing');
        });

        socket.on('survival:player_joined', (data) => {
            setRoomState(prev => prev ? { ...prev, players: data.players } : null);
        });

        socket.on('survival:game_starting', (data) => {
            setIsStarting(false);
            setRoomState(prev => ({ ...prev, totalRounds: data.totalRounds, baseQPerRound: data.baseQPerRound, questionsPerRoundMode: data.questionsPerRoundMode }));
            setView('playing');
            toast.success('Battle commencing!', { icon: '🔥' });
        });

        // Round intro — display for 2.5s before first question of that round
        socket.on('survival:round_intro', (data) => {
            setRoundIntro(data);
            setRoundResult(null);
            setMyAnswer(null);
            myAnswerRef.current = null;
            setAnswerResult(null);
            setIsSubmitting(false);
            if (!isEliminatedRef.current) setView('round_intro');
            setTimeout(() => setView('playing'), 2500);
        });

        socket.on('survival:preparing_question', () => {
            setRoundResult(null);
            setMyAnswer(null);
            myAnswerRef.current = null;
            setAnswerResult(null);
            setIsSubmitting(false);
        });

        socket.on('survival:new_question', (data) => {
            setMyAnswer(null);
            myAnswerRef.current = null;
            setIsSubmitting(false);
            setRoundResult(null);
            setAnswerResult(null);
            setCurrentQuestion(data);
            setTimerDuration(data.timer);
            setTimeLeft(data.timer);
            if (!isEliminatedRef.current) setView('playing');
        });

        socket.on('survival:answer_ack', (data) => {
            setAnswerResult(data);
            if (data.isCorrect) toast.success(`+${data.scoreAwarded} pts!`, { icon: '✅', duration: 1500 });
            else toast.error(`Incorrect!`, { duration: 1500 });
        });

        // Round end leaderboard (shown to all — alive + spectators + eliminated)
        socket.on('survival:round_result', (data) => {
            setRoundResult(data);
            setScores(data.leaderboard || []);
            setView('round_result');
        });

        socket.on('survival:score_update', (data) => {
            setScores(data.leaderboard || []);
        });

        socket.on('survival:eliminated', (data) => {
            isEliminatedRef.current = true;
            setIsEliminated(true);
            setFinalResults(prev => ({ ...prev, personal: data }));
            // Don't auto-navigate. User sees round_result then gets option to spectate/exit.
        });

        socket.on('survival:game_ended', (data) => {
            sessionStorage.removeItem('currentSurvivalRoomId');
            setFinalResults(data);
            setScores(data.leaderboard || []);
            setView('results');
        });

        const fetchInterval = setInterval(() => socket.emit('survival:get_rooms'), 10000);

        return () => {
            socket.off('survival:rooms_list');
            socket.off('survival:created');
            socket.off('survival:error');
            socket.off('survival:pin_resolved');
            socket.off('survival:room_state');
            socket.off('survival:player_joined');
            socket.off('survival:game_starting');
            socket.off('survival:round_intro');
            socket.off('survival:preparing_question');
            socket.off('survival:new_question');
            socket.off('survival:answer_ack');
            socket.off('survival:round_result');
            socket.off('survival:score_update');
            socket.off('survival:eliminated');
            socket.off('survival:game_ended');
            clearInterval(fetchInterval);
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [socket, connected]);

    // ── UI helpers ────────────────────────────────────────────
    const timerPercent = timerDuration > 0 ? (timeLeft / timerDuration) * 100 : 0;
    const timerColor = timeLeft <= 5 ? '#EF4444' : timeLeft <= 10 ? '#F59E0B' : '#10B981';
    const diffColor  = { easy: '#10B981', medium: '#F59E0B', hard: '#EF4444', advanced: '#8B5CF6' };

    // ══════════════════════ VIEWS ═══════════════════════════

    // ── CONFIGURE ────────────────────────────────────────────
    if (view === 'configure') {
        return (
            <div className="survival-arena-root">
                <div className="survival-config-card glass animate-fadeIn wide-config">
                    <FiLayers className="config-icon" />
                    <h2>Launch Survival Arena</h2>
                    <p>Configure your multi-round elimination battle</p>

                    <div className="config-form scroll-form">
                        <div className="form-row">
                            <div className="form-group">
                                <label>Match Title</label>
                                <input type="text" placeholder="e.g., Python Masters" value={configTitle} onChange={e => setConfigTitle(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Max Players (2–75)</label>
                                <input type="number" min="2" max="75" value={configMaxPlayers}
                                    onChange={e => setConfigMaxPlayers(e.target.value)}
                                    onBlur={() => { let v = parseInt(configMaxPlayers) || 2; v = Math.min(75, Math.max(2, v)); setConfigMaxPlayers(v); }} />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Description</label>
                            <textarea placeholder="Tell players what this is about..." value={configDescription} onChange={e => setConfigDescription(e.target.value)} rows="2" />
                        </div>

                        {/* Question Source */}
                        <div className="source-tabs">
                            <button className={configSource === 'topic' ? 'active' : ''} onClick={() => setConfigSource('topic')}><FiSearch /> Topic</button>
                            <button className={configSource === 'text'  ? 'active' : ''} onClick={() => setConfigSource('text')}><FiFileText /> Paste Text</button>
                            <button className={configSource === 'pdf'   ? 'active' : ''} onClick={() => setConfigSource('pdf')}><FiBookOpen /> PDF</button>
                        </div>
                        {configSource === 'topic' && (
                            <div className="form-group animate-slideDown">
                                <label>Topic Keyword</label>
                                <input type="text" placeholder="e.g., Data Structures, Organic Chemistry" value={configTopic} onChange={e => setConfigTopic(e.target.value)} />
                            </div>
                        )}
                        {configSource === 'text' && (
                            <div className="form-group animate-slideDown">
                                <label>Paste Content</label>
                                <textarea placeholder="Paste text here – AI will generate questions from it." value={configContent} onChange={e => setConfigContent(e.target.value)} rows="4" />
                            </div>
                        )}
                        {configSource === 'pdf' && (
                            <div className="pdf-upload-hint animate-slideDown">
                                <FiUploadCloud />
                                <input type="file" accept=".pdf,.txt" onChange={e => setConfigPdfFile(e.target.files[0])} className="pdf-input" />
                                <p>{configPdfFile ? configPdfFile.name : 'Upload PDF/TXT'}</p>
                            </div>
                        )}

                        {/* Round Config */}
                        <div className="section-divider"><span>Round Configuration</span></div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Starting Difficulty</label>
                                <div className="select-wrapper glass">
                                    <select value={configDifficulty} onChange={e => setConfigDifficulty(e.target.value)} className="difficulty-select">
                                        <option value="easy">Easy (Basic Recall)</option>
                                        <option value="medium">Medium (Core Concepts)</option>
                                        <option value="hard">Hard (Advanced Logic)</option>
                                    </select>
                                </div>
                                <small>Difficulty escalates automatically each round</small>
                            </div>
                            <div className="form-group">
                                <label>Number of Rounds (1–5)</label>
                                <input type="number" min="1" max="5" value={configRounds}
                                    onChange={e => setConfigRounds(e.target.value)}
                                    onBlur={() => { let v = parseInt(configRounds)||3; v=Math.min(5,Math.max(1,v)); setConfigRounds(v); }} />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>Questions per Round Mode</label>
                                <div className="q-mode-choices">
                                    <button className={`q-mode-btn ${configQMode === 'decremental' ? 'active' : ''}`} onClick={() => setConfigQMode('decremental')}>
                                        <FiTrendingUp /> Decremental
                                        <small>More Qs early, fewer later</small>
                                    </button>
                                    <button className={`q-mode-btn ${configQMode === 'equal' ? 'active' : ''}`} onClick={() => setConfigQMode('equal')}>
                                        <FiBarChart2 /> Equal
                                        <small>Same Qs every round</small>
                                    </button>
                                </div>
                            </div>
                            {configQMode === 'equal' && (
                                <div className="form-group animate-slideDown">
                                    <label>Questions per Round (1–5)</label>
                                    <input type="number" min="1" max="5" value={configQPerRound}
                                        onChange={e => setConfigQPerRound(e.target.value)}
                                        onBlur={() => { let v = parseInt(configQPerRound)||3; v=Math.min(5,Math.max(1,v)); setConfigQPerRound(v); }} />
                                </div>
                            )}
                        </div>

                        {/* Preview */}
                        <div className="round-preview">
                            <h4>📋 Round Preview</h4>
                            <div className="round-preview-grid">
                                {previewQCounts.map((qCount, i) => {
                                    const diff = ['easy','medium','hard','advanced','advanced'][i];
                                    return (
                                        <div key={i} className="round-preview-item" style={{ borderColor: diffColor[diff] }}>
                                            <span className="rp-round">Round {i+1}</span>
                                            <span className="rp-q">{qCount} Q{qCount>1?'s':''}</span>
                                            <span className="rp-diff" style={{ color: diffColor[diff] }}>{diff}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="config-actions">
                            <button className="btn-cancel" onClick={() => setView('lobby')}>Back</button>
                            <button className={`btn-launch ${isCreating ? 'loading' : ''}`} onClick={handleCreateRoom} disabled={isCreating}>
                                {isCreating ? 'GENERATING ARENA...' : '⚡ GENERATE MATCH PIN'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── LOBBY ─────────────────────────────────────────────────
    if (view === 'lobby') {
        return (
            <div className="survival-arena-root">
                <div className="survival-lobby animate-fadeIn">
                    <header className="lobby-header">
                        <div className="header-desc">
                            <h1>⚡ Survival Mode</h1>
                            <p>Multi-round elimination battle — wrong answers get you eliminated!</p>
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
                            <input type="text" placeholder="Enter 6-digit Match PIN" value={pinInput}
                                maxLength={6} onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))} />
                        </div>
                        <button className="btn-join-pin" onClick={handleJoinByPin}>Quick Join PIN</button>
                    </div>

                    <div className="room-finder">
                        <div className="search-bar">
                            <FiSearch />
                            <input type="text" placeholder="Search topics or hosts..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                        </div>
                        <div className="rooms-grid">
                            {availableRooms.length === 0 ? (
                                <div className="no-rooms"><FiUsers /><p>No active arenas. Create one!</p></div>
                            ) : (
                                availableRooms
                                    .filter(r => r.topic?.toLowerCase().includes(searchQuery.toLowerCase()) || r.hostName?.toLowerCase().includes(searchQuery.toLowerCase()))
                                    .map(room => (
                                        <div key={room.roomId} className="room-card glass animate-slideDown search-room-clickable"
                                            onClick={() => handleJoinRoom(room.roomId)} style={{ cursor: 'pointer' }}>
                                            <div className="room-info">
                                                <h3 className="room-title">{room.title || room.topic}</h3>
                                                <span className="room-topic-mini">{room.topic}</span>
                                                <span className="host-name">Host: {room.hostName}</span>
                                                <div className="room-tags">
                                                    <span className={`difficulty ${room.difficulty}`}>{room.difficulty}</span>
                                                    <span className="players"><FiUsers /> {room.playerCount}/{room.maxPlayers}</span>
                                                    <span className="rounds-badge">{room.rounds} Rounds</span>
                                                </div>
                                            </div>
                                            <div className="pin-required-badge" style={{ background: 'var(--kahoot-purple)', color: 'white' }}>
                                                <FiArrowRight /> Join Now
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

    // ── PREPARING (Waiting Room) ───────────────────────────────
    if (view === 'preparing') {
        return (
            <div className="survival-arena-root">
                <div className="survival-preparing animate-fadeIn">
                    <div className="preparing-card glass">
                        {roomState?.pin && (
                            <div className="match-pin-banner pulse-border">
                                <div className="pin-info">
                                    <span className="label">MATCH PIN</span>
                                    <strong className="pin-code">{roomState.pin}</strong>
                                </div>
                                <button className="btn-copy-pin" onClick={() => { navigator.clipboard.writeText(roomState.pin); toast.success('PIN copied!'); }}>
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
                                <span className="label">ROUNDS</span>
                                <span className="value">{roomState?.totalRounds || '?'}</span>
                            </div>
                            <div className="portal-stat">
                                <span className="label">Q MODE</span>
                                <span className="value">{roomState?.questionsPerRoundMode === 'decremental' ? 'Decremental' : 'Equal'}</span>
                            </div>
                            <div className="portal-stat">
                                <span className="label">DIFFICULTY</span>
                                <span className="value" style={{ color: diffColor[roomState?.startDifficulty] }}>
                                    {roomState?.startDifficulty?.toUpperCase() || '?'} → Advanced
                                </span>
                            </div>
                            <div className="portal-stat">
                                <span className="label">PLAYERS</span>
                                <span className="value">{roomState?.players?.length || 0} / {roomState?.maxPlayers}</span>
                            </div>
                        </div>

                        <div className="roster-section">
                            <h4>Participants</h4>
                            <div className="synchronized-roster">
                                {roomState?.players?.map((p, idx) => (
                                    <div key={p.userId || idx} className="roster-item profile-entrance">
                                        <div className="roster-avatar">
                                            {p.avatar ? <img src={p.avatar} alt="avatar" /> : <FiUser />}
                                            {roomState.host === p.userId && <span className="host-crown" title="Host">👑</span>}
                                        </div>
                                        <div className="roster-info">
                                            <span className="roster-name">{p.name} {p.userId === myId ? '(You)' : ''}</span>
                                            <span className="roster-status">READY</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {(!roomState?.players || roomState.players.length === 0) && <div className="waiting-pill">Waiting for players...</div>}
                        </div>

                        <div className="preparing-actions">
                            {roomState?.host === myId ? (
                                <>
                                    <button className={`btn-ignite ${isStarting ? 'loading' : ''}`} onClick={handleStartGame} disabled={isStarting}>
                                        {isStarting ? 'LAUNCHING...' : '⚡ INITIATE BATTLE PROTOCOL'}
                                    </button>
                                    <button className="btn-abort-match" onClick={() => setView('lobby')}>Dismantle Room</button>
                                </>
                            ) : (
                                <div className="waiting-for-host">
                                    <div className="loader-ring"></div>
                                    <span>Standby — Awaiting Host...</span>
                                    <button className="btn-leave-portal" onClick={() => setView('lobby')}>Exit Portal</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── ROUND INTRO ───────────────────────────────────────────
    if (view === 'round_intro') {
        return (
            <div className="survival-arena-root">
                <div className="round-intro-overlay animate-scaleIn">
                    <div className="round-intro-card glass">
                        <div className="round-badge">ROUND {roundIntro?.roundNumber} / {roundIntro?.totalRounds}</div>
                        <h2 style={{ color: diffColor[roundIntro?.difficulty] || '#fff' }}>
                            {roundIntro?.difficulty?.toUpperCase()} DIFFICULTY
                        </h2>
                        <p>{roundIntro?.questionsThisRound} Question{roundIntro?.questionsThisRound > 1 ? 's' : ''} this round</p>
                        <div className="round-alive-count"><FiUsers /> {roundIntro?.aliveCount} players remaining</div>
                        <div className="round-message">{roundIntro?.message}</div>
                    </div>
                </div>
            </div>
        );
    }

    // ── PLAYING ───────────────────────────────────────────────
    if (view === 'playing') {
        return (
            <div className="survival-arena-root">
                <div className="survival-playing animate-scaleIn">
                    <div className="survival-hud glass">
                        <div className="hud-left">
                            <div className="round-count">Round {currentQuestion?.roundNumber || 1}/{currentQuestion?.totalRounds || '?'}</div>
                            <div className="q-count">Q {currentQuestion?.questionNumber || 1}/{currentQuestion?.totalQInRound || '?'}</div>
                        </div>
                        <div className="hud-center">
                            <span className="diff-badge" style={{ background: diffColor[currentQuestion?.difficulty] }}>
                                {currentQuestion?.difficulty?.toUpperCase()}
                            </span>
                        </div>
                        <div className="hud-right">
                            <div className="alive-count"><FiUsers /> {currentQuestion?.aliveCount || 0} ALIVE</div>
                            {isEliminated && <div className="spectating-badge"><FiSkipForward /> Spectating</div>}
                        </div>
                    </div>

                    <main className="question-zone glass">
                        <div className="timer-bar-wrap">
                            <div className="timer-meta">
                                <span style={{ color: timerColor, fontWeight: 700 }}>{timeLeft}s</span>
                                <span className="topic-tag">{currentQuestion?.topic}</span>
                            </div>
                            <div className="timer-track">
                                <div className="timer-fill" style={{ width: `${timerPercent}%`, background: timerColor, transition: 'width 1s linear, background 0.3s' }} />
                            </div>
                        </div>

                        <h2 className="q-text">{currentQuestion?.question}</h2>

                        <div className="options-grid">
                            {currentQuestion?.options?.map((opt, i) => {
                                const isSelected = myAnswer === opt;
                                const isCorrect  = answerResult && opt === answerResult.correctAnswer;
                                const isWrong    = answerResult && isSelected && !answerResult.isCorrect;
                                return (
                                    <button key={opt}
                                        className={`opt-btn ${isSelected ? 'selected' : ''} ${isCorrect ? 'correct' : ''} ${isWrong ? 'wrong' : ''}`}
                                        onClick={() => !isSubmitting && !isEliminated && handleSubmitAnswer(opt)}
                                        disabled={isSubmitting || !!answerResult || isEliminated}>
                                        <span className="opt-marker">{String.fromCharCode(65 + i)}</span>
                                        <span className="opt-label">{opt}</span>
                                        {isCorrect && <FiCheckCircle className="res-icon" />}
                                        {isWrong   && <FiXCircle className="res-icon" />}
                                    </button>
                                );
                            })}
                        </div>

                        {answerResult && (
                            <div className={`answer-feedback-bar ${answerResult.isCorrect ? 'correct' : 'wrong'}`}>
                                {answerResult.isCorrect
                                    ? `✅ Correct! +${answerResult.scoreAwarded} pts`
                                    : `❌ Wrong! Correct: ${answerResult.correctAnswer}`}
                            </div>
                        )}
                        {isEliminated && <div className="eliminated-spectate-note">You are eliminated — watching as spectator</div>}
                    </main>

                    <aside className="survival-sidebar glass">
                        <h3><FiStar /> Live Scores</h3>
                        <div className="scores-list">
                            {scores.slice(0, 10).map((s, i) => (
                                <div key={s.userId} className={`score-row ${!s.isAlive ? 'eliminated' : ''} ${s.userId === myId ? 'me' : ''}`}>
                                    <span className="rank">#{s.rank || i+1}</span>
                                    <span className="name">{s.name}</span>
                                    <span className="pts">{s.score} pts</span>
                                </div>
                            ))}
                        </div>
                    </aside>
                </div>
            </div>
        );
    }

    // ── ROUND RESULT (shown to ALL after each round) ──────────
    if (view === 'round_result') {
        return (
            <div className="survival-arena-root">
                <div className="round-result-view animate-fadeIn">
                    <div className="rr-header glass">
                        <h2>Round {roundResult?.roundNumber} Complete</h2>
                        {roundResult?.nextRound
                            ? <p>Next: Round {roundResult.nextRound} starting soon...</p>
                            : <p>Final round complete!</p>}
                    </div>

                    <div className="rr-stats-row">
                        <div className="rr-stat glass">
                            <span className="rr-val">{roundResult?.survivors?.length || 0}</span>
                            <span className="rr-label">Survived</span>
                        </div>
                        <div className="rr-stat glass danger">
                            <span className="rr-val">{roundResult?.eliminated?.length || 0}</span>
                            <span className="rr-label">Eliminated</span>
                        </div>
                        <div className="rr-stat glass gold">
                            <span className="rr-val">+{roundResult?.roundBonus}</span>
                            <span className="rr-label">Survival Bonus</span>
                        </div>
                    </div>

                    {roundResult?.eliminated?.length > 0 && (
                        <div className="rr-eliminated-list glass">
                            <h4>💥 Eliminated This Round</h4>
                            {roundResult.eliminated.map(e => (
                                <div key={e.userId} className="elim-row">
                                    <FiXCircle className="elim-icon" />
                                    <span>{e.name}</span>
                                    <span className="elim-score">{e.score} pts</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="rr-leaderboard glass">
                        <h4><FiBarChart2 /> Current Standings</h4>
                        <div className="lb-table">
                            <div className="lb-header">
                                <span>Rank</span><span>Player</span><span>Score</span><span>Status</span>
                            </div>
                            {roundResult?.leaderboard?.map(p => (
                                <div key={p.userId} className={`lb-row ${p.userId === myId ? 'me' : ''} ${!p.isAlive ? 'eliminated' : ''}`}>
                                    <span className="lb-rank">
                                        {p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `#${p.rank}`}
                                    </span>
                                    <span className="lb-name">{p.name}</span>
                                    <span className="lb-score">{p.score} pts</span>
                                    <span className={`lb-status ${p.isAlive ? 'alive' : 'out'}`}>
                                        {p.isAlive ? '✅ Alive' : '💀 Out'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {isEliminated && (
                        <div className="spectate-options">
                            <button className="btn-spectate" onClick={() => setView('playing')}>
                                <FiSkipForward /> Continue Watching
                            </button>
                            <button className="btn-exit" onClick={() => navigate('/student/games')}>Exit Arena</button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── FINAL RESULTS (shown to ALL) ──────────────────────────
    if (view === 'results') {
        const winner = finalResults?.winner;
        const isMe   = winner?.userId === myId;
        return (
            <div className="survival-arena-root">
                <div className="survival-results animate-fadeIn">
                    <div className="results-card glass">
                        <div className="winner-announcement">
                            <FiAward className="winner-icon" />
                            <h1>{isMe ? '🏆 YOU WIN!' : 'BATTLE CONCLUDED'}</h1>
                            {winner && <div className="winner-name">🥇 Winner: <strong>{winner.name}</strong> — {winner.score} pts</div>}
                        </div>

                        <div className="final-stats-row">
                            <div className="fs-stat"><span className="fs-val">{finalResults?.totalRounds}</span><span className="fs-label">Rounds</span></div>
                            <div className="fs-stat"><span className="fs-val">{finalResults?.totalQuestions}</span><span className="fs-label">Questions</span></div>
                            <div className="fs-stat"><span className="fs-val">{finalResults?.leaderboard?.length}</span><span className="fs-label">Participants</span></div>
                        </div>

                        <div className="final-leaderboard">
                            <h3>🏆 Final Rankings</h3>
                            <div className="lb-table">
                                <div className="lb-header">
                                    <span>Rank</span><span>Player</span><span>Score</span><span>Survived</span><span>Accuracy</span>
                                </div>
                                {finalResults?.leaderboard?.map(p => (
                                    <div key={p.userId} className={`lb-row ${p.userId === myId ? 'me' : ''} ${p.isWinner ? 'winner-row' : ''} ${!p.isAlive && !p.isWinner ? 'eliminated' : ''}`}>
                                        <span className="lb-rank">
                                            {p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `#${p.rank}`}
                                        </span>
                                        <span className="lb-name">{p.name} {p.userId === myId ? '(You)' : ''}</span>
                                        <span className="lb-score">{p.score} pts</span>
                                        <span className="lb-rounds">{p.survivalRounds} rnd{p.survivalRounds !== 1 ? 's' : ''}</span>
                                        <span className="lb-acc">{p.accuracy}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="actions">
                            <button className="btn-again" onClick={() => { sessionStorage.removeItem('currentSurvivalRoomId'); window.location.reload(); }}>
                                Play Again
                            </button>
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
