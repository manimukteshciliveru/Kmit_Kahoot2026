import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { toast } from 'react-hot-toast';
import { 
    LuSword, LuUsers, LuTrophy, LuTimer, LuSkull, 
    LuBookOpen, LuX, LuChevronRight, LuTarget, 
    LuZap, LuShieldCheck, LuCrown, LuFlame, LuHeart
} from 'react-icons/lu';
import './BattleArena.css';

const BattleArena = () => {
    const { socket, connected } = useSocket();
    const { user } = useAuth();
    const [view, setView] = useState('selection'); // selection, searching, lobby, playing, results, preparing
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
    
    // Synchronized Progression States
    const [roundStatus, setRoundStatus] = useState('answering'); // answering, waiting, resolved
    const [roundResult, setRoundResult] = useState(null);
    
    // Battle Stats
    const [syncData, setSyncData] = useState(null);
    const [damageEffect, setDamageEffect] = useState(null); // 'self' or 'opponent'
    
    // Results
    const [finalResults, setFinalResults] = useState(null);

    const timerRef = useRef(null);
    const searchInterval = useRef(null);
    const overallTimerRef = useRef(null);
    const syncDataRef = useRef(null);
    const hasSubmittedRef = useRef(false);
    const questionStartTimeRef = useRef(Date.now());
    const questionEndTimeRef = useRef(0);
    const overallEndTimeRef = useRef(0); // 🕒 Authorized Sync End
    const timeOffsetRef = useRef(0); // 🕒 Server-Client Clock Offset
    const currentMaxTimerRef = useRef(20);
    const [lastTimeTaken, setLastTimeTaken] = useState(0);
    const [selectedAnswers, setSelectedAnswers] = useState({}); // 🕒 Local Review Mode
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showLevelMap, setShowLevelMap] = useState(false);

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

    useEffect(() => {
        if (socket && connected && user) {
            socket.emit('battle:enter_lobby', { mode: 'idle', topic: 'General' });
        }
    }, [socket, connected, user]);

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
            
            if (data.battleTimer > 0) {
                startOverallTimer(data.battleTimer, data.startTime, data.serverTime);
            }
            questionStartTimeRef.current = data.startTime || Date.now();
            currentMaxTimerRef.current = data.questionTimer;
            startQuestionTimer(data.questionTimer, data.startTime, data.serverTime);
            toast.success('Duel Started!', { icon: '⚔️' });
        });

        socket.on('battle:sync', (data) => {
            const prev = syncDataRef.current;
            if (prev) {
                const myId = (user.id || user._id).toString();
                const myPrev  = prev.players.find(p => p.userId === myId);
                const myNew   = data.players.find(p => p.userId === myId);
                const oppPrev = prev.players.find(p => p.userId !== myId);
                const oppNew  = data.players.find(p => p.userId !== myId);
                if (myNew?.hp  < myPrev?.hp)  triggerDamageEffect('self');
                if (oppNew?.hp < oppPrev?.hp) triggerDamageEffect('opponent');
            }
            syncDataRef.current = data;
            setSyncData(data);
        });

        socket.on('battle:next_question', ({ nextIndex, timer: serverTimer, startTime, serverTime }) => {
            setCurrentQuestionIndex(nextIndex);
            setRoundStatus('answering');
            setRoundResult(null);
            // hasSubmittedRef.current = false; // Manual navigation doesn't need this lock
        });

        socket.on('battle:waiting_for_match_end', () => {
             setRoundStatus('waiting_match_end');
        });

        socket.on('battle:waiting_for_match_end', () => {
             setRoundStatus('waiting_match_end');
        });

        socket.on('battle:ended', (data) => {
            cancelAnimationFrame(timerRef.current);
            setFinalResults(data);
            setView('results');
        });

        socket.on('battle:searching', () => {
            setView('searching');
            setSearchTime(0);
            clearInterval(searchInterval.current);
            searchInterval.current = setInterval(() => setSearchTime(p => p + 1), 1000);
        });

        socket.on('battle:preparing', () => {
            setView('preparing');
        });

        socket.on('battle:opponent_left', (data) => {
            toast.success(data.message, { icon: '🏆', duration: 5000 });
            cancelAnimationFrame(timerRef.current);
            clearInterval(overallTimerRef.current);
            setView('selection');
        });

        socket.on('battle:disconnect', () => {
            toast.error('Disconnected from battle server. Returning to selection.', { duration: 5000 });
            cancelAnimationFrame(timerRef.current);
            clearInterval(searchInterval.current);
            clearInterval(overallTimerRef.current);
            setView('selection');
        });

        socket.on('battle:extension_received', ({ requesterName }) => {
            toast((t) => (
                <div className="flex flex-col gap-2">
                    <span><strong>{requesterName}</strong> wants 15s more for this question!</span>
                    <div className="flex gap-2">
                        <button 
                            className="bg-green-600 px-3 py-1 rounded text-white" 
                            onClick={() => {
                                socket.emit('battle:extension_respond', { battleId: battleDataRef.current?.battleId, accept: true });
                                toast.dismiss(t.id);
                            }}
                        >
                            Allow
                        </button>
                        <button 
                            className="bg-red-600 px-3 py-1 rounded text-white" 
                            onClick={() => {
                                socket.emit('battle:extension_respond', { battleId: battleDataRef.current?.battleId, accept: false });
                                toast.dismiss(t.id);
                            }}
                        >
                            Deny
                        </button>
                    </div>
                </div>
            ), { duration: 8000, icon: '⏳' });
        });

        socket.on('battle:timer_extended', () => {
            currentMaxTimerRef.current += 15;
            questionEndTimeRef.current += 15000;
            // Recalculate immediate offset logic if needed, but end-time is now absolute
            toast.success('Time Extended by 15s!', { icon: '➕' });
        });

        socket.on('battle:extension_denied', () => {
            toast.error('Extension Request Denied');
        });

        return () => {
            socket.off('battle:lobby_update');
            socket.off('battle:incoming_challenge');
            socket.off('battle:started');
            socket.off('battle:sync');
            socket.off('battle:waiting_for_opponent');
            socket.off('battle:round_resolved');
            socket.off('battle:next_question');
            socket.off('battle:ended');
            socket.off('battle:searching');
            socket.off('battle:opponent_left');
            cancelAnimationFrame(timerRef.current);
            clearInterval(searchInterval.current);
            clearInterval(overallTimerRef.current);
            socket.off('battle:disconnect');
            socket.off('battle:extension_received');
            socket.off('battle:timer_extended');
            socket.off('battle:extension_denied');
        };
    }, [socket, connected, user]);

    const battleDataRef = useRef(null);
    useEffect(() => {
        battleDataRef.current = battleData;
    }, [battleData]);

    const startOverallTimer = (duration, serverStartTime, serverRecordTime) => {
        if (overallTimerRef.current) clearInterval(overallTimerRef.current);
        
        if (serverRecordTime) {
            timeOffsetRef.current = serverRecordTime - Date.now();
        }

        const baseTimeAtServer = serverStartTime || (Date.now() + timeOffsetRef.current);
        overallEndTimeRef.current = baseTimeAtServer + (duration * 1000);

        const tick = () => {
            const nowAtServer = Date.now() + timeOffsetRef.current;
            const remaining = Math.max(0, Math.ceil((overallEndTimeRef.current - nowAtServer) / 1000));
            setTotalRemaining(remaining);
            if (remaining <= 0) {
                clearInterval(overallTimerRef.current);
            }
        };

        overallTimerRef.current = setInterval(tick, 1000);
        tick(); // Immediate update
    };

    const triggerDamageEffect = (target) => {
        setDamageEffect(target);
        setTimeout(() => setDamageEffect(null), 500);
    };

    useEffect(() => {
        if (timer === 0 && roundStatus === 'answering') {
            handleAnswer(null);
        }
    }, [timer, roundStatus]);

    const startQuestionTimer = (duration, serverStartTime, serverRecordTime) => {
        cancelAnimationFrame(timerRef.current);
        
        if (serverRecordTime) {
            timeOffsetRef.current = serverRecordTime - Date.now();
        }

        const baseTimeAtServer = serverStartTime || (Date.now() + timeOffsetRef.current);
        questionEndTimeRef.current = baseTimeAtServer + (duration * 1000);
        
        const tick = () => {
            const nowAtServer = Date.now() + timeOffsetRef.current;
            const remaining = Math.max(0, Math.ceil((questionEndTimeRef.current - nowAtServer) / 1000));
            setTimer(remaining);
            if (remaining > 0) {
                timerRef.current = requestAnimationFrame(tick);
            }
        };
        timerRef.current = requestAnimationFrame(tick);
    };

    const requestExtension = () => {
        // Feature removed as per user request
    };

    const handleOptionSelect = (idx) => {
        setSelectedAnswers(prev => ({ ...prev, [currentQuestionIndex]: idx }));
    };

    const handleNext = () => {
        const answer = selectedAnswers[currentQuestionIndex];
        if (answer === undefined) return toast.error("Please select an answer first!");

        if (socket && battleData) {
            socket.emit('battle:submit_answer', { 
                battleId: battleData.battleId,
                questionIndex: currentQuestionIndex,
                answer: answer,
                timeTaken: 0 // No per-question timer pressure
            });
        }
    };

    const handlePrev = () => {
        if (currentQuestionIndex > 0) {
            // Check if we already have an answer in DB? 
            // In manual mode, maybe just show the previous question locally
            setCurrentQuestionIndex(prev => prev - 1);
        }
    };

    const startSearch = (mode = 'random') => {
        if (!selectedSubTopic && mode !== 'idle' && mode !== 'lobby') {
            return toast.error("Select a path first!");
        }
        
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

    return (
        <div className="arena-v2">
            {view === 'playing' && battleData && syncData && (
                <div className={`battle-playing-screen ${damageEffect ? `shake-${damageEffect}` : ''}`}>
                    <div className="battle-hud-v2">
                        <div className={`hud-side self ${damageEffect === 'self' ? 'damaged' : ''}`}>
                            <div className="hud-meta">
                                <span className="hud-name text-blue-400 font-bold">{user.name}</span>
                            </div>
                            {(() => {
                                const myId = (user.id || user._id)?.toString();
                                const myData = syncData?.players?.find(p => p.userId === myId);
                                return (
                                    <div className="hp-container">
                                        <div className={`hp-bar ${(myData?.hp ?? 100) > 60 ? 'healthy' : (myData?.hp ?? 100) > 30 ? 'moderate' : 'critical'}`} style={{ width: `${myData?.hp ?? 100}%` }} />
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="battle-vs-logo animate-pulse">
                            <div className="vs-badge">
                                <span className="vs-val">1VS1</span>
                                <div className="vs-glow"></div>
                            </div>
                        </div>

                        <div className={`hud-side opponent ${damageEffect === 'opponent' ? 'damaged' : ''}`}>
                            <div className="hud-meta flex items-center gap-2">
                                {(() => {
                                    const myId = (user.id || user._id)?.toString();
                                    const oppData = syncData?.players?.find(p => p.userId !== myId);
                                    return (
                                        <span className="hud-name text-white font-black text-lg tracking-wider" style={{ textShadow: '0 0 10px rgba(255,255,255,0.3)' }}>
                                            {oppData?.name || 'Opponent'}
                                        </span>
                                    );
                                })()}
                            </div>
                            {(() => {
                                const myId = (user.id || user._id)?.toString();
                                const oppData = syncData?.players?.find(p => p.userId !== myId);
                                return (
                                    <div className="hp-container">
                                        <div className={`hp-bar ${(oppData?.hp ?? 100) > 60 ? 'healthy' : (oppData?.hp ?? 100) > 30 ? 'moderate' : 'critical'}`} style={{ width: `${oppData?.hp ?? 100}%` }} />
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    {battleData.battleTimer > 0 && (
                        <div className="overall-match-timer glass">
                            <span className="label">Match Ends In:</span>
                            <span className="time">{Math.floor(totalRemaining / 60)}:{(totalRemaining % 60).toString().padStart(2, '0')}</span>
                        </div>
                    )}

                    <div className="combat-stage animate-scale-in">
                        {roundStatus === 'answering' && (
                            <div className="question-box glass">
                                <div className="q-indicator">Question {currentQuestionIndex + 1} / {battleData.quiz.questions.length}</div>
                                <h2 style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', textAlign: 'left', lineHeight: '1.6', fontSize: '1.2rem', margin: '1rem 0 2rem 0' }}>
                                    {battleData.quiz.questions[currentQuestionIndex].questionText}
                                </h2>
                                <div className="options-grid-v2">
                                    {battleData.quiz.questions[currentQuestionIndex].options.map((opt, idx) => (
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
                                <div className="q-nav-actions flex justify-between mt-8 pt-4 border-t border-white/10">
                                    <button 
                                        className="px-6 py-2 rounded-lg bg-white/5 text-white/50 hover:bg-white/10 disabled:opacity-30"
                                        onClick={handlePrev}
                                        disabled={currentQuestionIndex === 0}
                                    >
                                        Previous
                                    </button>
                                    <button 
                                        className="px-8 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-500 shadow-lg shadow-blue-500/20"
                                        onClick={handleNext}
                                    >
                                        {currentQuestionIndex === (battleData.quiz.questions.length - 1) ? 'Submit Quiz' : 'Finalize & Next'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {roundStatus === 'waiting_match_end' && (
                            <div className="waiting-overlay glass animate-float">
                                <LuLoader2 className="spinner-icon mx-auto text-4xl mb-4 text-blue-400" />
                                <h3>Finishing up!</h3>
                                <p>Waiting for the battle to conclude...</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {view === 'selection' && (
                <div className="arena-home animate-fadeInUp">
                    <div className="arena-header text-center">
                        <h1>Battle Arena</h1>
                        <p className="glow-text">Ascend the leaderboard. Prove your dominance.</p>
                    </div>

                    <div className="user-rank-status">
                        <div className="rank-card-v2 glass relative flex items-center gap-6 justify-between p-6">
                            <div className="flex items-center gap-4">
                                {getRankIcon(user.rank?.tier)}
                                <div className="rank-details">
                                    <h3>{user.rank?.tier || 'Bronze'} {user.rank?.level || 'I'}</h3>
                                    <p>{user.rank?.points || 0} Rating Points</p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-10 relative z-10">
                                <button 
                                    className={`btn-roadmap-toggle ${showLevelMap ? 'active' : ''}`}
                                    onClick={() => setShowLevelMap(!showLevelMap)}
                                    style={{ margin: '1em' }}
                                >
                                    <LuTrophy className="icon" />
                                    <span>Level Map</span>
                                </button>
                                <div className="streak-badge animate-glow">
                                    <LuFlame /> {user.rank?.winStreak || 0} Streak
                                </div>
                            </div>
                        </div>
                    </div>

                    {showLevelMap && (
                        <div className="rank-roadmap-container glass mb-8 p-6 pl-12 animate-slideDown w-full">
                            <div className="roadmap-header">
                                <LuTrophy className="text-yellow-400" />
                                <h3>Battle Rank Roadmap</h3>
                                <span className="current-pts">{user.rank?.points || 0} RP</span>
                            </div>
                            <div className="roadmap-steps">
                                {TIER_ROADMAP.map((t, idx) => {
                                    const currentPoints = user.rank?.points || 0;
                                    const isReached = currentPoints >= t.min;
                                    const nextLevel = TIER_ROADMAP[idx + 1];
                                    let progress = 0;
                                    
                                    if (nextLevel && currentPoints >= t.min) {
                                        progress = Math.min(100, ((currentPoints - t.min) / (nextLevel.min - t.min)) * 100);
                                    } else if (!nextLevel && currentPoints >= t.min) {
                                        progress = 100;
                                    }

                                    return (
                                        <div key={t.name} className={`roadmap-node node-${t.slug} ${isReached ? 'reached' : ''}`}>
                                            <div className="node-icon-wrapper">
                                                {t.icon}
                                                <div className="node-label">{t.name}</div>
                                                <div className="node-threshold">{t.min}</div>
                                            </div>
                                            {idx < TIER_ROADMAP.length - 1 && (
                                                <div className="roadmap-connector">
                                                    <div className="connector-fill" style={{ width: `${progress}%` }}></div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="roadmap-footer">
                                {(() => {
                                    const currentPoints = user.rank?.points || 0;
                                    const nextTier = TIER_ROADMAP.find(t => t.min > currentPoints);
                                    if (!nextTier) return <span>Maximum Rank Achieved!</span>;
                                    return <span><strong>{nextTier.min - currentPoints} RP</strong> needed for {nextTier.name}</span>;
                                })()}
                            </div>
                        </div>
                    )}

                    <div className="arena-controls glass">
                        <div className="path-picker">
                            <div className="form-group">
                                <label className="form-label">Category</label>
                                <select className="form-select" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                                    <option value="">Choose Category</option>
                                    {Object.keys(TOPIC_STRUCTURE).map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            {selectedCategory && (
                                <div className="form-group animate-slideDown">
                                    <label className="form-label">Sub-Topic</label>
                                    <select className="form-select" value={selectedSubTopic} onChange={(e) => setSelectedSubTopic(e.target.value)}>
                                        <option value="">Choose Topic</option>
                                        {TOPIC_STRUCTURE[selectedCategory].map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                            )}
                            {selectedSubTopic && (
                                <div className="form-group animate-slideDown flex gap-4">
                                    <div className="flex-1">
                                        <label className="form-label">Total Questions</label>
                                        <select className="form-select" value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))}>
                                            <option value={5}>5 Questions</option>
                                            <option value={10}>10 Questions</option>
                                            <option value={15}>15 Questions</option>
                                        </select>
                                    </div>
                                    <div className="flex-1">
                                        <label className="form-label">Battle Timer (optional)</label>
                                        <div className="flex gap-2">
                                            <select 
                                                className="form-select flex-1" 
                                                value={[0, 120, 300, 600].includes(battleTimer) ? battleTimer : 'custom'} 
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === 'custom') {
                                                        const min = prompt("Enter custom battle time (minutes):", "15");
                                                        if (min && !isNaN(min)) setBattleTimer(Number(min) * 60);
                                                    } else {
                                                        setBattleTimer(Number(val));
                                                    }
                                                }}
                                            >
                                                <option value={0}>None</option>
                                                <option value={120}>2 mins</option>
                                                <option value={300}>5 mins</option>
                                                <option value={600}>10 mins</option>
                                                <option value="custom">Custom...</option>
                                            </select>
                                            {![0, 120, 300, 600].includes(battleTimer) && (
                                                <div className="custom-timer-badge total">{Math.floor(battleTimer/60)}m {battleTimer%60}s</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="action-buttons mt-6">
                            <button className="btn-match random btn-lg" disabled={!selectedSubTopic} onClick={() => startSearch('random')}>
                                <LuSword className="animate-bounce" /> Find Match
                            </button>
                            <button className="btn-match browse btn-lg" onClick={() => startSearch('lobby')}>
                                <LuUsers /> Matchmaking Lobby
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {view === 'searching' && (
                <div className="searching-v2 animate-fade-in flex flex-col items-center justify-center min-h-[60vh]">
                    <div className="radar-v2">
                        <div className="circle animate-ping"></div>
                        <LuSword className="radar-sword animate-spin" />
                    </div>
                    <h2 className="text-2xl font-bold mt-8 animate-pulse text-blue-400">Finding Opponent...</h2>
                    <div className="search-meta flex gap-4 mt-6">
                        <span className="bg-blue-600/20 text-blue-400 px-4 py-1 rounded-full border border-blue-400/30">{selectedCategory}</span>
                        <span className="bg-orange-600/20 text-orange-400 px-4 py-1 rounded-full border border-orange-400/30">{selectedSubTopic}</span>
                    </div>
                    <span className="text-xl font-mono mt-4 text-slate-300">{searchTime}s</span>
                    <button className="btn-back-v2 mt-8" onClick={() => setView('selection')}>
                        <LuX /> Stop Searching
                    </button>
                </div>
            )}

            {view === 'preparing' && (
                <div className="preparing-v2 animate-fade-in flex flex-col items-center justify-center min-h-[60vh]">
                    <div className="radar-v2">
                        <div className="circle animate-ping"></div>
                        <LuSword className="radar-sword animate-spin" />
                    </div>
                    <h2 className="text-2xl font-bold mt-8 animate-pulse text-blue-400">Battle Preparing...</h2>
                    <p className="text-slate-400 mt-2">Summoning questions and initializing the arena</p>
                    <div className="w-64 h-1 bg-slate-800 rounded-full mt-6 overflow-hidden">
                        <div className="h-full bg-blue-500 animate-loading-bar"></div>
                    </div>
                </div>
            )}

            {view === 'lobby' && (
                <div className="lobby-v2 animate-slide-up">
                    <div className="lobby-head glass">
                        <div className="flex flex-col gap-1">
                            <h2 className="flex items-center gap-3 m-0 text-2xl">
                                <LuUsers className="text-3xl text-blue-400" />
                                Battle Registry
                            </h2>
                            <p className="text-slate-400 m-0 text-sm">Select your opponent to begin the duel</p>
                        </div>
                    </div>
                    <div className="lobby-grid p-4">
                        <div className="lobby-controls-bar mb-6">
                            <button className="btn-back-v2" onClick={() => setView('selection')}>
                                <LuX /> Close Registry
                            </button>
                            <div className="lobby-stats-mini">
                                <span className="live-dot"></span> 
                                {lobbyPlayers.length} Students Online
                            </div>
                        </div>

                        {lobbyPlayers.length === 0 ? (
                            <div className="empty-lobby text-center">
                                <LuUsers className="empty-icon" />
                                <p>The arena is quiet... for now.</p>
                            </div>
                        ) : (
                            <div className="players-grid">
                                {lobbyPlayers.map(p => {
                                    const myId = user.id || user._id;
                                    const isMe = p.userId.toString() === myId.toString();
                                    return (
                                        <div key={p.userId} className={`player-card-v2 ${isMe ? 'me' : ''} glass`}>
                                            <div className="p-card-header">
                                                {p.avatar ? (
                                                    <img 
                                                        src={p.avatar} 
                                                        alt={p.name} 
                                                        className="p-avatar-lg" 
                                                        onError={(e) => {
                                                            e.target.onerror = null;
                                                            e.target.src = 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
                                                        }}
                                                    />
                                                ) : (
                                                    <div className="avatar-fallback"><LuUsers /></div>
                                                )}
                                                <div className="p-status-mini">
                                                    {getRankIcon(p.rank?.tier)}
                                                </div>
                                            </div>
                                            <div className="p-card-body">
                                                <h4>{p.name}</h4>
                                                <span className="p-rank-label">{p.rank?.tier} {p.rank?.level}</span>
                                                <div className="p-topic-tag">
                                                    <LuBookOpen /> {p.topic.split(': ')[1] || 'Any'}
                                                </div>
                                            </div>
                                            <div className="p-card-footer">
                                                {isMe ? (
                                                    <span className="badge badge-info">You</span>
                                                ) : (
                                                    <button className="btn-challenge-v3" onClick={() => handleChallenge(p.userId)}>
                                                        <LuSword /> Challenge
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {view === 'results' && finalResults && (
                <div className="results-v2 animate-fade-in">
                    <div className="results-card">
                        <LuTrophy className={`trophy-icon ${finalResults.isDraw ? 'draw' : (finalResults.winner === user.name ? 'winner' : 'loser')}`} />
                        <h1>{finalResults.isDraw ? 'DRAW' : (finalResults.winner === user.name ? 'VICTORY' : 'DEFEAT')}</h1>
                        <div className="score-summary-v2">
                            {finalResults.results.map((r, idx) => {
                                const myId = user.id || user._id;
                                return (
                                <div key={idx} className={`summary-row ${r.userId?.toString() === (user.id || user._id)?.toString() ? 'highlight' : ''}`}>
                                    <span>{r.name}</span>
                                    <span className={`delta ${r.rankDelta >= 0 ? 'pos' : 'neg'}`}>
                                        {r.rankDelta > 0 ? '+' : ''}{r.rankDelta} RP
                                    </span>
                                    <span>{r.tier} {r.lvl}</span>
                                </div>
                                );
                            })}
                        </div>
                        <button className="btn btn-primary btn-lg" onClick={() => setView('selection')}>Return to Base</button>
                    </div>
                </div>
            )}

            {incomingChallenge && (
                <div className="challenge-toast">
                    <LuSword />
                    <div className="c-text">
                        <strong>{incomingChallenge.challengerName}</strong> wants to duel!
                        <p>{incomingChallenge.topic} • {incomingChallenge.questionCount} Qs • {incomingChallenge.questionTimer}s Timer {incomingChallenge.battleTimer > 0 ? `• ${incomingChallenge.battleTimer/60}m Match` : ''}</p>
                    </div>
                    <div className="c-btns">
                        <button className="acc" onClick={() => socket.emit('battle:respond_challenge', { challengerUserId: incomingChallenge.challengerUserId, accept: true, topic: incomingChallenge.topic, questionCount: incomingChallenge.questionCount, questionTimer: incomingChallenge.questionTimer, battleTimer: incomingChallenge.battleTimer })}>Accept</button>
                        <button className="dec" onClick={() => setIncomingChallenge(null)}>Reject</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BattleArena;
