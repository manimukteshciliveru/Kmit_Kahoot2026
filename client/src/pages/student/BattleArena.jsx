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
    const [view, setView] = useState('selection'); // selection, searching, lobby, playing, results
    const [lobbyPlayers, setLobbyPlayers] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedSubTopic, setSelectedSubTopic] = useState('');
    const [incomingChallenge, setIncomingChallenge] = useState(null);
    const [battleData, setBattleData] = useState(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [timer, setTimer] = useState(20);
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

    const TOPIC_STRUCTURE = {
        'Python': ['Basics', 'Loops', 'Arrays', 'Classes', 'Dictionaries', 'Functions', 'Decorators', 'Generators', 'Iterators', 'Exception Handling', 'File I/O', 'Regex', 'OOPs', 'Multithreading', 'Networking', 'Web Scrapping'],
        'Java': ['Basics', 'OOPs', 'Collections', 'Inheritance', 'Polymorphism', 'Abstractions', 'Encapsulation', 'Streams', 'Multithreading', 'Generics', 'JVM Architecture', 'Garbage Collection', 'Exception Handling', 'Networking', 'Servlets', 'JSP'],
        'JavaScript': ['Basics', 'Variables', 'Data Types', 'Closures', 'Async/Await', 'ES6+', 'DOM Manipulation', 'Promises', 'Event Loop', 'Callback Function', 'Arrow Functions', 'Strict Mode', 'JSON', 'Local Storage'],
        'Data Structures': ['Arrays', 'Linked Lists', 'Trees', 'Graphs', 'Stacks/Queues', 'Hash Tables', 'Heaps', 'Trie'],
        'Algorithms': ['Sorting', 'Searching', 'Dynamic Programming', 'Recursion', 'Backtracking', 'Greedy Algorithms', 'Sliding Window', 'Two Pointers'],
        'Web': ['HTML5 Semantic', 'CSS Grid/Flexbox', 'Responsive Design', 'SASS/SCSS', 'React Basics', 'State Management', 'React Hooks', 'Routing', 'API Integration', 'Next.js']
    };

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
            setSyncData({
                players: data.players.map(p => ({ userId: p.userId, hp: 100, score: 0 }))
            });
            setView('playing');
            setCurrentQuestionIndex(0);
            setRoundStatus('answering');
            startQuestionTimer();
            toast.success('Duel Started!', { icon: '⚔️' });
        });

        socket.on('battle:sync', (data) => {
            if (syncData) {
                const myId = user.id || user._id;
                const myPrevHp = syncData.players.find(p => p.userId.toString() === myId.toString())?.hp;
                const myNewHp = data.players.find(p => p.userId.toString() === myId.toString())?.hp;
                const oppPrevHp = syncData.players.find(p => p.userId.toString() !== myId.toString())?.hp;
                const oppNewHp = data.players.find(p => p.userId.toString() !== myId.toString())?.hp;

                if (myNewHp < myPrevHp) triggerDamageEffect('self');
                if (oppNewHp < oppPrevHp) triggerDamageEffect('opponent');
            }
            setSyncData(data);
        });

        socket.on('battle:waiting_for_opponent', () => {
            setRoundStatus('waiting');
            clearInterval(timerRef.current);
        });

        socket.on('battle:round_resolved', (data) => {
            setRoundResult(data);
            setRoundStatus('resolved');
            clearInterval(timerRef.current);
        });

        socket.on('battle:next_question', ({ nextIndex }) => {
            setCurrentQuestionIndex(nextIndex);
            setRoundStatus('answering');
            setRoundResult(null);
            startQuestionTimer();
        });

        socket.on('battle:ended', (data) => {
            clearInterval(timerRef.current);
            setFinalResults(data);
            setView('results');
        });

        socket.on('battle:searching', () => {
            setView('searching');
            setSearchTime(0);
            clearInterval(searchInterval.current);
            searchInterval.current = setInterval(() => setSearchTime(p => p + 1), 1000);
        });

        socket.on('battle:opponent_left', (data) => {
            toast.success(data.message, { icon: '🏆', duration: 5000 });
            clearInterval(timerRef.current);
            setView('selection');
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
            clearInterval(timerRef.current);
            clearInterval(searchInterval.current);
        };
    }, [socket, connected, syncData, user]);

    const triggerDamageEffect = (target) => {
        setDamageEffect(target);
        setTimeout(() => setDamageEffect(null), 500);
    };

    const startQuestionTimer = () => {
        setTimer(20);
        clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setTimer(prev => {
                if (prev <= 1) {
                    handleAnswer(null);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const handleAnswer = (answerIndex) => {
        if (roundStatus !== 'answering') return;
        
        clearInterval(timerRef.current);
        if (socket && battleData) {
            socket.emit('battle:submit_answer', {
                battleId: battleData.battleId,
                questionIndex: currentQuestionIndex,
                answer: answerIndex,
                timeTaken: (20 - timer) * 1000
            });
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
                topic: selectedSubTopic ? `${selectedCategory}: ${selectedSubTopic}` : 'General'
            });
        }
    };

    const handleChallenge = (targetUserId) => {
        if (!selectedSubTopic) return toast.error("Select your battle topic first!");
        if (socket) {
            socket.emit('battle:challenge_player', { 
                targetUserId, 
                topic: `${selectedCategory}: ${selectedSubTopic}` 
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
                                <span className="hud-name">{user.name}</span>
                                <span className="hud-score">{syncData.players.find(p => p.userId.toString() === (user.id || user._id).toString())?.score || 0} XP</span>
                            </div>
                            <div className="hp-container">
                                <div className="hp-bar" style={{ width: `${syncData.players.find(p => p.userId.toString() === (user.id || user._id).toString())?.hp || 100}%` }}></div>
                                <LuHeart className="hp-icon" />
                            </div>
                        </div>

                        <div className="match-timer-ring">
                            <svg viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="45" className="timer-bg" />
                                <circle cx="50" cy="50" r="45" className="timer-progress"
                                    style={{ strokeDashoffset: (1 - timer/20) * 283 }} />
                            </svg>
                            <span className="timer-val">{timer}</span>
                        </div>

                        <div className={`hud-side opponent ${damageEffect === 'opponent' ? 'damaged' : ''}`}>
                            <div className="hud-meta">
                                <span className="hud-name">Opponent</span>
                                <span className="hud-score">{syncData.players.find(p => p.userId.toString() !== (user.id || user._id).toString())?.score || 0} XP</span>
                            </div>
                            <div className="hp-container">
                                <div className="hp-bar" style={{ width: `${syncData.players.find(p => p.userId.toString() !== (user.id || user._id).toString())?.hp || 100}%` }}></div>
                                <LuHeart className="hp-icon" />
                            </div>
                        </div>
                    </div>

                    <div className="combat-stage animate-scale-in">
                        {roundStatus === 'answering' && (
                            <div className="question-box glass">
                                <div className="q-indicator">Question {currentQuestionIndex + 1} / {battleData.quiz.questions.length}</div>
                                <h2>{battleData.quiz.questions[currentQuestionIndex].questionText}</h2>
                                <div className="options-grid-v2">
                                    {battleData.quiz.questions[currentQuestionIndex].options.map((opt, idx) => (
                                        <button key={idx} className="opt-v2" onClick={() => handleAnswer(idx)}>
                                            <div className="opt-idx">{String.fromCharCode(65 + idx)}</div>
                                            <span className="opt-label">{opt.text}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {roundStatus === 'waiting' && (
                            <div className="waiting-overlay glass animate-pulse">
                                <LuTimer className="waiting-icon" />
                                <h2>Waiting for Opponent...</h2>
                                <p>You answered in {((20 - timer)).toFixed(1)}s</p>
                            </div>
                        )}

                        {roundStatus === 'resolved' && roundResult && (
                            <div className="round-resolution glass animate-scale-in">
                                <div className="res-header">
                                    <LuTarget />
                                    <h2>Round {currentQuestionIndex + 1} Results</h2>
                                </div>
                                <div className="res-grid">
                                    {roundResult.players.map(p => (
                                        <div key={p.userId} className={`res-block ${p.userId === (user.id || user._id).toString() ? 'me' : ''}`}>
                                            <div className="res-info">
                                                <span className="player-name">{p.name}</span>
                                                <span className={`res-badge ${p.isCorrect ? 'correct' : 'wrong'}`}>
                                                    {p.isCorrect ? 'CORRECT' : 'WRONG'}
                                                </span>
                                            </div>
                                            <div className="res-meta">
                                                <span>Speed: {(p.timeTaken / 1000).toFixed(1)}s</span>
                                                <span className="xp-gain">+{p.isCorrect ? (p.timeTaken < 3000 ? 15 : 10) : 0} XP</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="next-round-bar">
                                    <div className="progress"></div>
                                </div>
                                <p className="status-footer">Next question incoming...</p>
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
                        <div className="rank-card-v2 glass">
                            {getRankIcon(user.rank?.tier)}
                            <div className="rank-details">
                                <h3>{user.rank?.tier || 'Bronze'} {user.rank?.level || 'I'}</h3>
                                <p>{user.rank?.points || 0} Rating Points</p>
                            </div>
                            <div className="streak-badge animate-glow">
                                <LuFlame /> {user.rank?.winStreak || 0} Streak
                            </div>
                        </div>
                    </div>

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
                        </div>

                        <div className="action-buttons">
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
                <div className="searching-v2 animate-fadeIn">
                    <div className="radar-v2">
                        <div className="circle"></div>
                        <div className="circle"></div>
                        <div className="circle"></div>
                        <LuSword className="radar-sword" />
                    </div>
                    <h2 className="animate-pulse">Finding Opponent...</h2>
                    <div className="search-meta">
                        <span className="badge badge-primary">{selectedCategory}</span>
                        <span className="badge badge-warning">{selectedSubTopic}</span>
                    </div>
                    <span className="search-timer">{searchTime}s</span>
                    <button className="btn btn-danger btn-sm" onClick={() => setView('selection')}>
                        <LuX /> Stop Searching
                    </button>
                </div>
            )}

            {view === 'lobby' && (
                <div className="lobby-v2 animate-slide-up">
                    <div className="lobby-head glass">
                        <div className="flex items-center gap-4">
                            <LuUsers className="text-3xl text-blue-400" />
                            <div>
                                <h2>Battle Registry</h2>
                                <p>Select your opponent to begin the duel</p>
                            </div>
                        </div>
                    </div>
                    <div className="lobby-grid p-4">
                        <div className="lobby-controls-bar mb-6">
                            <button className="btn-back-v2" onClick={() => setView('selection')}>
                                <LuX /> Close Registry
                            </button>
                            <div className="lobby-stats-mini">
                                <span className="live-dot"></span> 
                                {lobbyPlayers.length} Legends Active
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
                        <LuTrophy className={`trophy-icon ${finalResults.winner === user.name ? 'winner' : 'loser'}`} />
                        <h1>{finalResults.winner === user.name ? 'VICTORY' : 'DEFEAT'}</h1>
                        <div className="score-summary-v2">
                            {finalResults.results.map(r => {
                                const myId = user.id || user._id;
                                return (
                                <div key={r.userId} className={`summary-row ${r.userId === myId.toString() ? 'highlight' : ''}`}>
                                    <span>{r.name}</span>
                                    <span className={`delta ${r.rankDelta >= 0 ? 'pos' : 'neg'}`}>
                                        {r.rankDelta >= 0 ? '+' : ''}{r.rankDelta} RP
                                    </span>
                                    <span className="new-tier">{r.tier} {r.lvl}</span>
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
                        <p>{incomingChallenge.topic}</p>
                    </div>
                    <div className="c-btns">
                        <button className="acc" onClick={() => socket.emit('battle:respond_challenge', { challengerUserId: incomingChallenge.challengerUserId, accept: true, topic: incomingChallenge.topic })}>Accept</button>
                        <button className="dec" onClick={() => setIncomingChallenge(null)}>Reject</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BattleArena;
