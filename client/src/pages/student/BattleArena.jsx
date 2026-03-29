import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { toast } from 'react-hot-toast';
import { 
    LuSword, LuUsers, LuTrophy, LuTimer, LuSkull, 
    LuBookOpen, LuX, LuChevronRight, LuTarget, 
    LuZap, LuShieldCheck, LuCrown, LuFlame, LuHeart, LuLoader
} from 'react-icons/lu';
import './BattleArena.css';

const BattleArena = () => {
    // 1. Context and Hooks
    const { socket, connected } = useSocket();
    const { user } = useAuth();

    // -- Authentication Helper --
    const myId = useMemo(() => {
        const id = user?.id || user?._id;
        return id ? id.toString() : null;
    }, [user]);

    // 2. Refs
    const timerRef = useRef(null);
    const searchInterval = useRef(null);
    const overallTimerRef = useRef(null);
    const syncDataRef = useRef(null);
    const questionStartTimeRef = useRef(Date.now());
    const questionEndTimeRef = useRef(0);
    const overallEndTimeRef = useRef(0);
    const timeOffsetRef = useRef(0);
    const currentMaxTimerRef = useRef(20);
    const battleDataRef = useRef(null);

    // 3. State
    const [view, setView] = useState('selection'); 
    const [lobbyPlayers, setLobbyPlayers] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedSubTopic, setSelectedSubTopic] = useState('');
    const [questionCount, setQuestionCount] = useState(5);
    const [questionTimer, setQuestionTimer] = useState(20);
    const [incomingChallenge, setIncomingChallenge] = useState(null);
    const [battleData, setBattleData] = useState(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [timer, setTimer] = useState(20);
    const [battleTimer, setBattleTimer] = useState(0); 
    const [totalRemaining, setTotalRemaining] = useState(0);
    const [searchTime, setSearchTime] = useState(0);
    const [roundStatus, setRoundStatus] = useState('answering'); 
    const [roundResult, setRoundResult] = useState(null);
    const [syncData, setSyncData] = useState(null);
    const [damageEffect, setDamageEffect] = useState(null);
    const [finalResults, setFinalResults] = useState(null);
    const [selectedAnswers, setSelectedAnswers] = useState({}); 
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showLevelMap, setShowLevelMap] = useState(false);

    // Constants
    const TOPIC_STRUCTURE = {
        'Python': ['Basics', 'Loops', 'Arrays', 'Classes', 'Dictionaries', 'Functions', 'Decorators', 'Generators', 'Iterators', 'Exception Handling', 'File I/O', 'Regex', 'OOPs', 'Multithreading', 'Networking', 'Web Scrapping'],
        'Java': ['Basics', 'OOPs', 'Collections', 'Inheritance', 'Polymorphism', 'Abstractions', 'Encapsulation', 'Streams', 'Multithreading', 'Generics', 'JVM Architecture', 'Garbage Collection', 'Exception Handling', 'Networking', 'Servlets', 'JSP'],
        'JavaScript': ['Basics', 'Variables', 'Data Types', 'Closures', 'Async/Await', 'ES6+', 'DOM Manipulation', 'Promises', 'Event Loop', 'Callback Function', 'Arrow Functions', 'Strict Mode', 'JSON', 'Local Storage'],
        'Data Structures': ['Arrays', 'Linked Lists', 'Trees', 'Graphs', 'Stacks/Queues', 'Hash Tables', 'Heaps', 'Trie'],
        'Algorithms': ['Sorting', 'Searching', 'Dynamic Programming', 'Recursion', 'Backtracking', 'Greedy Algorithms', 'Sliding Window', 'Two Pointers'],
        'Web': ['HTML5 Semantic', 'CSS Grid/Flexbox', 'Responsive Design', 'SASS/SCSS', 'React Basics', 'State Management', 'React Hooks', 'Routing', 'API Integration', 'Next.js']
    };

    const TIER_ROADMAP = [
        { name: 'Bronze', min: 0, slug: 'bronze', icon: <LuShieldCheck style={{ color: '#CD7F32' }} /> },
        { name: 'Silver', min: 600, slug: 'silver', icon: <LuShieldCheck style={{ color: '#C0C0C0' }} /> },
        { name: 'Gold', min: 1500, slug: 'gold', icon: <LuCrown style={{ color: '#FFD700' }} /> },
        { name: 'Platinum', min: 2700, slug: 'platinum', icon: <LuZap style={{ color: '#50C878' }} /> },
        { name: 'Diamond', min: 3900, slug: 'diamond', icon: <LuTarget style={{ color: '#B9F2FF' }} /> },
        { name: 'Master', min: 4800, slug: 'master', icon: <LuFlame style={{ color: '#FF4D4D' }} /> },
        { name: 'Grandmaster', min: 5000, slug: 'gm', icon: <LuCrown style={{ color: '#FF00FF' }} /> }
    ];

    // Helper: Find player data
    const mySyncData = syncData?.players?.find(p => p.userId === myId);
    const oppSyncData = syncData?.players?.find(p => p.userId !== myId);

    // Functions
    const triggerDamageEffect = (target) => {
        setDamageEffect(target);
        setTimeout(() => setDamageEffect(null), 500);
    };

    const startOverallTimer = (duration, serverStartTime, serverRecordTime) => {
        if (overallTimerRef.current) clearInterval(overallTimerRef.current);
        if (serverRecordTime) timeOffsetRef.current = serverRecordTime - Date.now();
        const baseTimeAtServer = serverStartTime || (Date.now() + timeOffsetRef.current);
        overallEndTimeRef.current = baseTimeAtServer + (duration * 1000);
        const tick = () => {
            const nowAtServer = Date.now() + timeOffsetRef.current;
            const remaining = Math.max(0, Math.ceil((overallEndTimeRef.current - nowAtServer) / 1000));
            setTotalRemaining(remaining);
            if (remaining <= 0) if (overallTimerRef.current) clearInterval(overallTimerRef.current);
        };
        overallTimerRef.current = setInterval(tick, 1000);
        tick();
    };

    const startQuestionTimer = (duration, serverStartTime, serverRecordTime) => {
        cancelAnimationFrame(timerRef.current);
        if (serverRecordTime) timeOffsetRef.current = serverRecordTime - Date.now();
        const baseTimeAtServer = serverStartTime || (Date.now() + timeOffsetRef.current);
        questionEndTimeRef.current = baseTimeAtServer + (duration * 1000);
        const tick = () => {
            const nowAtServer = Date.now() + timeOffsetRef.current;
            const remaining = Math.max(0, Math.ceil((questionEndTimeRef.current - nowAtServer) / 1000));
            setTimer(remaining);
            if (remaining > 0) timerRef.current = requestAnimationFrame(tick);
        };
        timerRef.current = requestAnimationFrame(tick);
    };

    const handleAnswer = (answerIndex) => {
        if (isSubmitting || !socket || !battleData) return;
        setIsSubmitting(true);
        const timeTaken = Date.now() - questionStartTimeRef.current;
        socket.emit('battle:submit_answer', { 
            battleId: battleData.battleId,
            questionIndex: currentQuestionIndex,
            answer: answerIndex,
            timeTaken: timeTaken
        });
    };

    const handleOptionSelect = (idx) => {
        setSelectedAnswers(prev => ({ ...prev, [currentQuestionIndex]: idx }));
    };

    const handleNext = () => {
        const answer = selectedAnswers[currentQuestionIndex];
        if (answer === undefined) return toast.error("Please select an answer first!");
        handleAnswer(answer);
    };

    const handlePrev = () => {
        if (currentQuestionIndex > 0) setCurrentQuestionIndex(prev => prev - 1);
    };

    const startSearch = (mode = 'random') => {
        if (!selectedSubTopic && mode !== 'idle' && mode !== 'lobby') return toast.error("Select a path first!");
        if (socket) {
            if (mode === 'lobby') setView('lobby');
            socket.emit('battle:enter_lobby', { 
                mode, 
                topic: selectedSubTopic ? `${selectedCategory}: ${selectedSubTopic}` : 'General',
                questionCount,
                questionTimer,
                battleTimer
            });
        }
    };

    const handleChallenge = (targetUserId) => {
        if (!selectedSubTopic) return toast.error("Select your battle topic first!");
        if (socket) {
            socket.emit('battle:challenge_player', { 
                targetUserId, 
                topic: `${selectedCategory}: ${selectedSubTopic}`,
                questionCount,
                questionTimer,
                battleTimer
            });
            toast.success('Challenge Dispatched!');
        }
    };

    const getRankIcon = (tier) => {
        const t = tier?.toLowerCase();
        if (t === 'bronze') return <LuShieldCheck className="rank-i bronze" />;
        if (t === 'silver') return <LuShieldCheck className="rank-i silver" />;
        if (t === 'gold') return <LuCrown className="rank-i gold" />;
        if (t === 'platinum') return <LuZap className="rank-i platinum" />;
        if (t === 'diamond') return <LuTarget className="rank-i diamond" />;
        if (t === 'master') return <LuFlame className="rank-i master" />;
        if (t === 'grandmaster') return <LuCrown className="rank-i gm" />;
        return <LuShieldCheck className="rank-i" />;
    };

    // Effects
    useEffect(() => {
        battleDataRef.current = battleData;
    }, [battleData]);

    useEffect(() => {
        if (socket && connected && user) {
            socket.emit('battle:enter_lobby', { mode: 'idle', topic: 'General' });
        }
    }, [socket, connected, user]);

    useEffect(() => {
        if (timer === 0 && roundStatus === 'answering') handleAnswer(null);
    }, [timer, roundStatus]);

    useEffect(() => {
        if (!socket || !connected) return;

        socket.on('battle:lobby_update', setLobbyPlayers);
        socket.on('battle:incoming_challenge', setIncomingChallenge);
        
        socket.on('battle:started', (data) => {
            setBattleData(data);
            setIncomingChallenge(null);
            setSyncData({
                players: data.players.map(p => ({ userId: p.userId, hp: 100, score: 0 }))
            });
            setView('playing');
            setCurrentQuestionIndex(0);
            setRoundStatus('answering');
            if (data.battleTimer > 0) startOverallTimer(data.battleTimer, data.startTime, data.serverTime);
            questionStartTimeRef.current = data.startTime || Date.now();
            currentMaxTimerRef.current = data.questionTimer;
            startQuestionTimer(data.questionTimer, data.startTime, data.serverTime);
            toast.success('Duel Started!', { icon: '⚔️' });
        });

        socket.on('battle:sync', (data) => {
            const prev = syncDataRef.current;
            if (prev && myId) {
                const myPrev  = prev.players.find(p => p.userId === myId);
                const lclMyNew   = data.players.find(p => p.userId === myId);
                const oppPrev = prev.players.find(p => p.userId !== myId);
                const lclOppNew  = data.players.find(p => p.userId !== myId);
                if (lclMyNew?.hp  < myPrev?.hp)  triggerDamageEffect('self');
                if (lclOppNew?.hp < oppPrev?.hp) triggerDamageEffect('opponent');
            }
            syncDataRef.current = data;
            setSyncData(data);
        });

        socket.on('battle:next_question', ({ nextIndex, timer: serverTimer, startTime, serverTime }) => {
            setCurrentQuestionIndex(nextIndex);
            setRoundStatus('answering');
            setRoundResult(null);
            setIsSubmitting(false);
            questionStartTimeRef.current = Date.now();
            startQuestionTimer(serverTimer, startTime, serverTime);
        });

        socket.on('battle:waiting_for_match_end', () => setRoundStatus('waiting_match_end'));
        socket.on('battle:ended', (data) => {
            cancelAnimationFrame(timerRef.current);
            setFinalResults(data);
            setView('results');
        });

        socket.on('battle:searching', () => {
            setView('searching');
            setSearchTime(0);
            if (searchInterval.current) clearInterval(searchInterval.current);
            searchInterval.current = setInterval(() => setSearchTime(p => p + 1), 1000);
        });

        socket.on('battle:preparing', () => setView('preparing'));
        socket.on('battle:opponent_left', (data) => {
            toast.success(data.message, { icon: '🏆', duration: 5000 });
            cancelAnimationFrame(timerRef.current);
            if (overallTimerRef.current) clearInterval(overallTimerRef.current);
            setView('selection');
        });

        socket.on('battle:disconnect', () => {
            toast.error('Disconnected from battle server.', { duration: 5000 });
            cancelAnimationFrame(timerRef.current);
            if (searchInterval.current) clearInterval(searchInterval.current);
            if (overallTimerRef.current) clearInterval(overallTimerRef.current);
            setView('selection');
        });

        socket.on('battle:extension_received', ({ requesterName }) => {
            toast((t) => (
                <div className="flex flex-col gap-2">
                    <span><strong>{requesterName}</strong> wants 15s more!</span>
                    <div className="flex gap-2">
                        <button className="bg-green-600 px-3 py-1 rounded text-white" onClick={() => {
                            socket.emit('battle:extension_respond', { battleId: battleDataRef.current?.battleId, accept: true });
                            toast.dismiss(t.id);
                        }}>Allow</button>
                        <button className="bg-red-600 px-3 py-1 rounded text-white" onClick={() => {
                            socket.emit('battle:extension_respond', { battleId: battleDataRef.current?.battleId, accept: false });
                            toast.dismiss(t.id);
                        }}>Deny</button>
                    </div>
                </div>
            ), { duration: 8000, icon: '⏳' });
        });

        socket.on('battle:timer_extended', () => {
            currentMaxTimerRef.current += 15;
            questionEndTimeRef.current += 15000;
            toast.success('Time Extended!', { icon: '➕' });
        });

        socket.on('battle:extension_denied', () => toast.error('Extension Request Denied'));

        return () => {
            socket.off('battle:lobby_update');
            socket.off('battle:incoming_challenge');
            socket.off('battle:started');
            socket.off('battle:sync');
            socket.off('battle:next_question');
            socket.off('battle:ended');
            socket.off('battle:searching');
            socket.off('battle:preparing');
            socket.off('battle:opponent_left');
            socket.off('battle:disconnect');
            socket.off('battle:extension_received');
            socket.off('battle:timer_extended');
            socket.off('battle:extension_denied');
            cancelAnimationFrame(timerRef.current);
            if (searchInterval.current) clearInterval(searchInterval.current);
            if (overallTimerRef.current) clearInterval(overallTimerRef.current);
        };
    }, [socket, connected, user, battleData, roundStatus, timer, myId]);

    // Render Logic
    if (view === 'playing') {
        const myHpPercent = (mySyncData?.hp ?? 100);
        const oppHpPercent = (oppSyncData?.hp ?? 100);

        return (
            <div className="arena-v2">
                <div className={`battle-playing-screen ${damageEffect ? `shake-${damageEffect}` : ''}`}>
                    <div className="battle-hud-v2">
                        <div className={`hud-side self ${damageEffect === 'self' ? 'damaged' : ''}`}>
                            <div className="hud-meta">
                                <span className="hud-name text-blue-400 font-bold">{user?.name}</span>
                            </div>
                            <div className="hp-container">
                                <div className={`hp-bar ${myHpPercent > 60 ? 'healthy' : myHpPercent > 30 ? 'moderate' : 'critical'}`} style={{ width: `${myHpPercent}%` }} />
                            </div>
                        </div>
                        <div className="battle-vs-logo animate-pulse">
                            <div className="vs-badge"><span className="vs-val">1VS1</span><div className="vs-glow"></div></div>
                        </div>
                        <div className={`hud-side opponent ${damageEffect === 'opponent' ? 'damaged' : ''}`}>
                            <div className="hud-meta flex items-center gap-2">
                                <span className="hud-name text-white font-black text-lg tracking-wider" style={{ textShadow: '0 0 10px rgba(255,255,255,0.3)' }}>
                                    {oppSyncData?.name || 'Opponent'}
                                </span>
                            </div>
                            <div className="hp-container">
                                <div className={`hp-bar ${oppHpPercent > 60 ? 'healthy' : oppHpPercent > 30 ? 'moderate' : 'critical'}`} style={{ width: `${oppHpPercent}%` }} />
                            </div>
                        </div>
                    </div>

                    {battleData?.battleTimer > 0 && (
                        <div className="overall-match-timer glass">
                            <span className="label">Match Ends In:</span>
                            <span className="time">{Math.floor(totalRemaining / 60)}:{(totalRemaining % 60).toString().padStart(2, '0')}</span>
                        </div>
                    )}

                    <div className="battle-arena-main-stage animate-scale-in">
                        {roundStatus === 'answering' && (
                            <div className="battle-question-container">
                                <div className="battle-q-nav-top">
                                    {(battleData?.quiz?.questions || []).map((_, i) => (
                                        <div 
                                            key={i}
                                            className={`battle-q-dot ${i === currentQuestionIndex ? 'active' : selectedAnswers[i] !== undefined ? 'answered' : ''}`}
                                            onClick={() => setCurrentQuestionIndex(i)}
                                        >
                                            {i + 1}
                                        </div>
                                    ))}
                                </div>
                                <div className="question-box glass">
                                    <div className="q-indicator">Question {currentQuestionIndex + 1} / {battleData?.quiz?.questions?.length}</div>
                                    <h2 className="q-text-premium">{battleData?.quiz?.questions[currentQuestionIndex]?.questionText}</h2>
                                    <div className="options-grid-v2">
                                        {(battleData?.quiz?.questions[currentQuestionIndex]?.options || []).map((opt, idx) => (
                                            <button 
                                                key={idx} 
                                                className={`opt-v2 ${selectedAnswers[currentQuestionIndex] === idx ? 'selected' : ''}`} 
                                                onClick={() => handleOptionSelect(idx)}
                                            >
                                                <div className="opt-idx">{String.fromCharCode(65 + idx)}</div>
                                                <span className="opt-label">{opt.text}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="q-nav-actions">
                                        <button className="btn-prev" onClick={handlePrev} disabled={currentQuestionIndex === 0}>
                                            <LuChevronRight style={{ transform: 'rotate(180deg)' }} /> Previous
                                        </button>
                                        <button className="btn-next" onClick={handleNext}>
                                            {currentQuestionIndex === ((battleData?.quiz?.questions?.length || 1) - 1) ? 'Submit Quiz' : 'Finalize & Next'} <LuChevronRight />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {roundStatus === 'waiting_match_end' && (
                            <div className="waiting-overlay glass animate-float">
                                <LuLoader className="spinner-icon mx-auto text-4xl mb-4 text-blue-400 animate-spin" />
                                <h3>Finishing up!</h3>
                                <p>Waiting for the battle to conclude...</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'selection') {
        const currentPoints = user?.rank?.points || 0;
        const nextTier = TIER_ROADMAP.find(t => t.min > currentPoints);

        return (
            <div className="arena-v2">
                <div className="arena-home animate-fadeInUp">
                    <div className="arena-header text-center">
                        <h1>Battle Arena</h1>
                        <p className="glow-text">Ascend the leaderboard. Prove your dominance.</p>
                    </div>
                    <div className="user-rank-status">
                        <div className="rank-card-v2 glass relative flex items-center gap-6 justify-between p-6">
                            <div className="flex items-center gap-4">
                                {getRankIcon(user?.rank?.tier)}
                                <div className="rank-details">
                                    <h3>{user?.rank?.tier || 'Bronze'} {user?.rank?.level || 'I'}</h3>
                                    <p>{currentPoints} RP</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-10 relative z-10">
                                <button className={`btn-roadmap-toggle ${showLevelMap ? 'active' : ''}`} onClick={() => setShowLevelMap(!showLevelMap)} style={{ margin: '1em' }}>
                                    <LuTrophy className="icon" />
                                    <span>Level Map</span>
                                </button>
                                <div className="streak-badge animate-glow"><LuFlame /> {user?.rank?.winStreak || 0} Streak</div>
                            </div>
                        </div>
                    </div>
                    {showLevelMap && (
                        <div className="rank-roadmap-container glass mb-8 p-6 pl-12 animate-slideDown w-full">
                            <div className="roadmap-header">
                                <LuTrophy className="text-yellow-400" /><h3>Battle Rank Roadmap</h3>
                                <span className="current-pts">{currentPoints} RP</span>
                            </div>
                            <div className="roadmap-steps">
                                {TIER_ROADMAP.map((t, idx) => {
                                    const isReached = currentPoints >= t.min;
                                    const nextLvl = TIER_ROADMAP[idx + 1];
                                    let progress = 0;
                                    if (nextLvl && isReached) progress = Math.min(100, ((currentPoints - t.min) / (nextLvl.min - t.min)) * 100);
                                    else if (!nextLvl && isReached) progress = 100;
                                    return (
                                        <div key={t.name} className={`roadmap-node node-${t.slug} ${isReached ? 'reached' : ''}`}>
                                            <div className="node-icon-wrapper">{t.icon}<div className="node-label">{t.name}</div><div className="node-threshold">{t.min}</div></div>
                                            {idx < TIER_ROADMAP.length - 1 && <div className="roadmap-connector"><div className="connector-fill" style={{ width: `${progress}%` }}></div></div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    <div className="arena-controls glass">
                        <div className="path-picker">
                            <div className="form-group"><label className="form-label">Category</label>
                                <select className="form-select" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                                    <option value="">Choose Category</option>
                                    {Object.keys(TOPIC_STRUCTURE).map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            {selectedCategory && (
                                <div className="form-group animate-slideDown"><label className="form-label">Sub-Topic</label>
                                    <select className="form-select" value={selectedSubTopic} onChange={(e) => setSelectedSubTopic(e.target.value)}>
                                        <option value="">Choose Topic</option>
                                        {TOPIC_STRUCTURE[selectedCategory].map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>
                        <div className="action-buttons mt-6">
                            <button className="btn-match random btn-lg" disabled={!selectedSubTopic} onClick={() => startSearch('random')}><LuSword className="animate-bounce" /> Find Match</button>
                            <button className="btn-match browse btn-lg" onClick={() => startSearch('lobby')}><LuUsers /> Matchmaking Lobby</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'searching') {
        return (
            <div className="arena-v2">
                <div className="searching-v2 animate-fade-in flex flex-col items-center justify-center min-h-[60vh]">
                    <div className="radar-v2"><div className="circle animate-ping"></div><LuSword className="radar-sword animate-spin" /></div>
                    <h2 className="text-2xl font-bold mt-8 animate-pulse text-blue-400">Finding Opponent...</h2>
                    <span className="text-xl font-mono mt-4 text-slate-300">{searchTime}s</span>
                    <button className="btn-back-v2 mt-8" onClick={() => setView('selection')}><LuX /> Stop Searching</button>
                </div>
            </div>
        );
    }

    if (view === 'preparing') {
        return (
            <div className="arena-v2">
                <div className="preparing-v2 animate-fade-in flex flex-col items-center justify-center min-h-[60vh]">
                    <div className="radar-v2"><div className="circle animate-ping"></div><LuSword className="radar-sword animate-spin" /></div>
                    <h2 className="text-2xl font-bold mt-8 animate-pulse text-blue-400">Battle Preparing...</h2>
                </div>
            </div>
        );
    }

    if (view === 'lobby') {
        return (
            <div className="arena-v2">
                <div className="lobby-v2 animate-slide-up">
                    <div className="lobby-controls-bar p-4"><button className="btn-back-v2" onClick={() => setView('selection')}><LuX /> Close Registry</button></div>
                    <div className="players-grid p-4">
                        {lobbyPlayers.length === 0 ? <p>Arena is quiet...</p> : (
                            lobbyPlayers.map(p => (
                                <div key={p.userId} className={`player-card-v2 glass`}>
                                    <h4>{p.name}</h4>
                                    <p>{p.rank?.tier} {p.rank?.level}</p>
                                    <button className="btn-challenge-v3" onClick={() => handleChallenge(p.userId)}><LuSword /> Challenge</button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'results') {
        return (
            <div className="arena-v2">
                <div className="results-v2 animate-fade-in">
                    <div className="results-card glass">
                        <h1>{finalResults?.isDraw ? 'DRAW' : (finalResults?.winner === user?.name ? 'VICTORY' : 'DEFEAT')}</h1>
                        <button className="btn btn-primary btn-lg" onClick={() => setView('selection')}>Return to Base</button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};

export default BattleArena;
