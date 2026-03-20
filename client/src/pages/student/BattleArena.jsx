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

    // --- Automatic Lobby Entry ---
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
            setCurrentQuestionIndex(0); // Reset index for safety
            startQuestionTimer();
            toast.success('Battle Started!', { icon: '⚔️' });
        });

        socket.on('battle:sync', (data) => {
            if (syncData) {
                const myId = user.id || user._id; // Handle both id formats
                const myPrevHp = syncData.players.find(p => p.userId.toString() === myId.toString())?.hp;
                const myNewHp = data.players.find(p => p.userId.toString() === myId.toString())?.hp;
                const oppPrevHp = syncData.players.find(p => p.userId.toString() !== myId.toString())?.hp;
                const oppNewHp = data.players.find(p => p.userId.toString() !== myId.toString())?.hp;

                if (myNewHp < myPrevHp) triggerDamageEffect('self');
                if (oppNewHp < oppPrevHp) triggerDamageEffect('opponent');
            }
            setSyncData(data);
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
        clearInterval(timerRef.current);
        if (socket && battleData) {
            socket.emit('battle:submit_answer', {
                battleId: battleData.battleId,
                questionIndex: currentQuestionIndex,
                answer: answerIndex,
                timeTaken: (20 - timer) * 1000
            });
        }

        // Wait brief second to show selection before next Q
        if (currentQuestionIndex < battleData.quiz.questions.length - 1) {
            setTimeout(() => {
                setCurrentQuestionIndex(prev => prev + 1);
                startQuestionTimer();
            }, 1000);
        }
    };

    const startSearch = (mode = 'random') => {
        if (!selectedSubTopic && mode !== 'idle') {
            return toast.error("Select a path first!");
        }
        
        if (socket) {
            if (mode === 'lobby') setView('lobby');
            socket.emit('battle:enter_lobby', { 
                mode, 
                topic: `${selectedCategory}: ${selectedSubTopic}` 
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

    if (view === 'playing' && battleData && syncData) {
        const q = battleData.quiz.questions[currentQuestionIndex];
        const myId = user.id || user._id;
        const selfMatch = syncData.players.find(p => p.userId.toString() === myId.toString());
        const oppoMatch = syncData.players.find(p => p.userId.toString() !== myId.toString());

        return (
            <div className={`battle-playing-screen ${damageEffect ? `shake-${damageEffect}` : ''}`}>
                <div className="battle-hud-v2">
                    <div className={`hud-side self ${damageEffect === 'self' ? 'damaged' : ''}`}>
                        <div className="hud-meta">
                            <span className="hud-name">{user.name}</span>
                            <span className="hud-score">{selfMatch?.score || 0} XP</span>
                        </div>
                        <div className="hp-container">
                            <div className="hp-bar" style={{ width: `${selfMatch?.hp || 100}%` }}></div>
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
                            <span className="hud-score">{oppoMatch?.score || 0} XP</span>
                        </div>
                        <div className="hp-container">
                            <div className="hp-bar" style={{ width: `${oppoMatch?.hp || 100}%` }}></div>
                            <LuHeart className="hp-icon" />
                        </div>
                    </div>
                </div>

                <div className="combat-stage">
                    <div className="question-box">
                        <div className="q-indicator">Question {currentQuestionIndex+1} / {battleData.quiz.questions.length}</div>
                        <h2>{q.questionText}</h2>
                        <div className="options-grid-v2">
                            {q.options.map((opt, idx) => (
                                <button key={idx} className="opt-v2" onClick={() => handleAnswer(idx)}>
                                    <span className="opt-idx">{String.fromCharCode(65 + idx)}</span>
                                    <span className="opt-label">{opt.text}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="arena-v2">
            {view === 'selection' && (
                <div className="arena-home">
                    <div className="arena-header">
                        <h1>The Battle Arena</h1>
                        <p>Ascend the leaderboard. Prove your dominance.</p>
                    </div>

                    <div className="user-rank-status">
                        <div className="rank-card-v2">
                            {getRankIcon(user.rank?.tier)}
                            <div className="rank-details">
                                <h3>{user.rank?.tier || 'Bronze'} {user.rank?.level || 'I'}</h3>
                                <p>{user.rank?.points || 0} Rating Points</p>
                            </div>
                            <div className="streak-badge">
                                <LuFlame /> {user.rank?.winStreak || 0} Streak
                            </div>
                        </div>
                    </div>

                    <div className="arena-controls">
                        <div className="path-picker">
                            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                                <option value="">Select Category</option>
                                {Object.keys(TOPIC_STRUCTURE).map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            {selectedCategory && (
                                <select className="fade-in" value={selectedSubTopic} onChange={(e) => setSelectedSubTopic(e.target.value)}>
                                    <option value="">Select Topic</option>
                                    {TOPIC_STRUCTURE[selectedCategory].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            )}
                        </div>

                        <div className="action-buttons">
                            <button className="btn-match random" disabled={!selectedSubTopic} onClick={() => startSearch('random')}>
                                <LuSword /> Quick Match
                            </button>
                            <button className="btn-match browse" onClick={() => startSearch('lobby')}>
                                <LuUsers /> Browse Lobby
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {view === 'searching' && (
                <div className="searching-v2">
                    <div className="radar-v2">
                        <div className="circle"></div>
                        <div className="circle"></div>
                        <LuSword className="radar-sword" />
                    </div>
                    <h2>Matchmaking...</h2>
                    <p>{selectedSubTopic}</p>
                    <span className="search-timer">{searchTime}s</span>
                    <button className="btn-cancel" onClick={() => setView('selection')}>Back</button>
                </div>
            )}

            {view === 'lobby' && (
                <div className="lobby-v2 animate-slide-up">
                    <div className="lobby-head">
                        <h2>Battle Lobby</h2>
                        <p>{lobbyPlayers.length} online</p>
                        <button className="close-lobby" onClick={() => setView('selection')}><LuX /></button>
                    </div>
                    <div className="lobby-list">
                        {lobbyPlayers.length === 0 ? (
                            <p className="no-players">Checking area... everyone is preparing.</p>
                        ) : (
                            lobbyPlayers.map(p => {
                                const myId = user.id || user._id;
                                return (
                                <div key={p.userId} className={`lobby-item ${p.userId === myId.toString() ? 'me' : ''}`}>
                                    <img src={p.avatar} alt={p.name} />
                                    <div className="p-info">
                                        <h4>{p.name}</h4>
                                        <span>{p.rank?.tier} {p.rank?.level}</span>
                                    </div>
                                    {p.userId !== myId.toString() && (
                                        <button className="challenge-btn-v2" onClick={() => handleChallenge(p.userId)}>Challenge</button>
                                    )}
                                </div>
                                );
                            })
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
                        
                        <button className="btn-return" onClick={() => setView('selection')}>Return to Base</button>
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
