import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import { 
    LuSword, LuUsers, LuTrophy, LuTimer, LuSkull, 
    LuBookOpen, LuX, LuChevronRight, LuTarget, 
    LuZap, LuShieldCheck, LuCrown 
} from 'react-icons/lu';
import './BattleArena.css';

import { useSocket } from '../../context/SocketContext';

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
    const [score, setScore] = useState(0);
    const [opponentData, setOpponentData] = useState({ score: 0, status: 'thinking' });
    const [timer, setTimer] = useState(15);
    const [rankUpdate, setRankUpdate] = useState(null);
    const [searchTime, setSearchTime] = useState(0);

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
        if (!socket || !connected) return;

        socket.on('battle:lobby_update', setLobbyPlayers);
        socket.on('battle:incoming_challenge', setIncomingChallenge);
        socket.on('battle:started', (data) => {
            setBattleData(data);
            setView('playing');
            startQuestionTimer();
        });
        socket.on('battle:opponent_update', (data) => {
            setOpponentData(prev => ({ ...prev, score: data.opponentScore, status: 'answered' }));
        });
        socket.on('battle:rank_update', setRankUpdate);
        socket.on('battle:opponent_left', (data) => {
            toast.success(data.message, { icon: '🏆', duration: 5000 });
            clearInterval(timerRef.current);
            setView('selection');
        });
        socket.on('battle:ended', (data) => {
            clearInterval(timerRef.current);
            setView('results');
        });

        return () => {
            socket.off('battle:lobby_update');
            socket.off('battle:incoming_challenge');
            socket.off('battle:started');
            socket.off('battle:opponent_update');
            socket.off('battle:rank_update');
            socket.off('battle:ended');
        };
    }, [socket, connected]);

    const startQuestionTimer = () => {
        setTimer(20);
        clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setTimer(prev => {
                if (prev <= 1) {
                    handleAnswer(null, true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const handleAnswer = (answerIndex, isTimeout = false) => {
        clearInterval(timerRef.current);
        if (socket) {
            socket.emit('battle:submit_answer', {
                battleId: battleData.battleId,
                questionIndex: currentQuestionIndex,
                answer: answerIndex,
                timeTaken: (20 - timer) * 1000
            });
        }

        if (currentQuestionIndex < battleData.quiz.questions.length - 1) {
            setTimeout(() => {
                setCurrentQuestionIndex(prev => prev + 1);
                setOpponentData(prev => ({ ...prev, status: 'thinking' }));
                startQuestionTimer();
            }, 1000);
        }
    };

    const startSearch = (mode = 'random') => {
        if (!selectedCategory || !selectedSubTopic) {
            toast.error("Set your battle path/topic first!");
            return;
        }
        setView(mode === 'random' ? 'searching' : 'lobby');
        setSearchTime(0);
        searchInterval.current = setInterval(() => setSearchTime(prev => prev + 1), 1000);
        if (socket) {
            socket.emit('battle:enter_lobby', { 
                mode, 
                topic: `${selectedCategory}: ${selectedSubTopic}` 
            });
        }
    };

    const handleChallenge = (targetSocketId, targetUserId) => {
        if (targetUserId === user._id) return toast.error("Self-duel is prohibited.");
        const fullTopic = `${selectedCategory}: ${selectedSubTopic}`;
        if (socket) {
            console.log('⚔️ [ARENA] Sending challenge to:', targetSocketId, 'Topic:', fullTopic);
            socket.emit('battle:challenge_player', { targetSocketId, topic: fullTopic });
        }
        toast.success(`Challenging for ${selectedSubTopic}...`);
    };

    const getRankBadge = (tier) => {
        const t = tier?.toLowerCase();
        switch(t) {
            case 'bronze': return <LuShieldCheck style={{color: '#cd7f32'}} />;
            case 'silver': return <LuShieldCheck style={{color: '#c0c0c0'}} />;
            case 'gold': return <LuCrown style={{color: '#ffd700'}} />;
            case 'platinum': return <LuZap style={{color: '#e5e4e2'}} />;
            case 'diamond': return <LuTarget style={{color: '#b9f2ff'}} />;
            case 'heroic': return <LuSkull style={{color: '#ff4d4d'}} />;
            case 'grandmaster': return <LuCrown style={{color: '#ff00ff'}} />;
            default: return <LuTrophy />;
        }
    };

    if (view === 'playing' && battleData) {
        const q = battleData.quiz.questions[currentQuestionIndex];
        return (
            <div className="battle-playing-screen">
                <div className="battle-hud">
                    <div className="player-stats self">
                        <div className="hud-avatar"><img src={user.avatar} alt="Me" /></div>
                        <div className="hud-info">
                            <span className="hud-name">{user.name}</span>
                            <span className="hud-score">{score} XP</span>
                        </div>
                    </div>

                    <div className="battle-timer-ring">
                        <svg className="timer-svg" viewBox="0 0 100 100">
                            <circle className="timer-bg" cx="50" cy="50" r="45" />
                            <circle className="timer-progress" cx="50" cy="50" r="45" 
                                style={{ strokeDashoffset: (1 - timer/20) * 283 }} />
                        </svg>
                        <span className="timer-text">{timer}</span>
                    </div>

                    <div className="player-stats opponent">
                        <div className="hud-info">
                            <span className="hud-name">Opponent</span>
                            <span className="hud-score">{opponentData.score} XP</span>
                        </div>
                        <div className="hud-avatar">
                            <div className={`status-dot ${opponentData.status}`}></div>
                            <img src="https://ui-avatars.com/api/?name=Opponent" alt="Enemy" />
                        </div>
                    </div>
                </div>

                <div className="question-arena">
                    <div className="question-card-outer">
                        <div className="q-header">
                            <span className="q-count">Question {currentQuestionIndex + 1}/{battleData.quiz.questions.length}</span>
                            <h2>{q.questionText}</h2>
                        </div>
                        <div className="options-grid">
                            {q.options.map((opt, idx) => (
                                <button key={idx} className="battle-option-btn" onClick={() => handleAnswer(idx)}>
                                    <span className="opt-letter">{String.fromCharCode(65 + idx)}</span>
                                    <span className="opt-text">{opt.text}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="battle-arena-page">
            <div className="arena-overlay">
                {view === 'selection' && (
                    <div className="battle-hero">
                        <div className="battle-title-content">
                            <h1>The Arena</h1>
                            <p>Test your knowledge. Rise through the ranks.</p>
                        </div>
                        
                        <div className="hero-stats-card">
                            <div className="rank-summary">
                                <span className={`rank-badge ${user.rank?.tier?.toLowerCase() || 'bronze'}`}>
                                    {getRankBadge(user.rank?.tier)} {user.rank?.tier || 'Bronze'} {user.rank?.level || 1}
                                </span>
                                <div className="points-display">
                                    <LuTrophy /> {user.rank?.points || 0} RP
                                </div>
                            </div>
                        </div>

                        <div className="topic-master-container">
                            <h3>1. Choose Your Path</h3>
                            <div className="topic-selector-group">
                                <div className="selector-wrapper">
                                    <LuBookOpen className="selector-icon" />
                                    <select 
                                        className="battle-topic-dropdown"
                                        value={selectedCategory} 
                                        onChange={(e) => {
                                            setSelectedCategory(e.target.value);
                                            setSelectedSubTopic('');
                                        }}
                                    >
                                        <option value="">Select Category</option>
                                        {Object.keys(TOPIC_STRUCTURE).map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>

                                {selectedCategory && (
                                    <div className="selector-wrapper sub-topic-animate">
                                        <LuBookOpen className="selector-icon" />
                                        <select 
                                            className="battle-topic-dropdown"
                                            value={selectedSubTopic} 
                                            onChange={(e) => setSelectedSubTopic(e.target.value)}
                                        >
                                            <option value="">Select Topic</option>
                                            {TOPIC_STRUCTURE[selectedCategory].map(topic => (
                                                <option key={topic} value={topic}>{topic}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="battle-modes">
                            <button 
                                className="mode-btn primary pulse"
                                onClick={() => startSearch('random')}
                                disabled={!selectedSubTopic}
                            >
                                <LuSword /> Quick Match
                            </button>
                            <button 
                                className="mode-btn outlined"
                                onClick={() => startSearch('lobby')}
                                disabled={!selectedSubTopic}
                            >
                                <LuUsers /> Browse Lobby
                            </button>
                        </div>
                    </div>
                )}

                {view === 'searching' && (
                    <div className="searching-overlay">
                        <div className="radar-animation">
                            <div className="radar-circle"></div>
                            <div className="radar-circle"></div>
                            <div className="radar-circle"></div>
                            <LuSword className="radar-icon" />
                        </div>
                        <h2>Finding Opponent...</h2>
                        <p>{selectedSubTopic} Battle</p>
                        <p className="search-timer">{searchTime}s</p>
                        <button className="cancel-search-btn" onClick={() => setView('selection')}>
                            Cancel
                        </button>
                    </div>
                )}

                {view === 'lobby' && (
                    <div className="lobby-overlay">
                        <div className="lobby-header">
                            <h2>Battle Lobby</h2>
                            <button className="close-lobby-btn" onClick={() => setView('selection')}>
                                <LuX />
                            </button>
                        </div>
                        <div className="lobby-players-grid">
                            {lobbyPlayers.map(p => (
                                <div key={p.socketId} className={`lobby-player-card ${p.userId === user._id ? 'self' : ''}`}>
                                    <div className="player-avatar-wrapper">
                                        <img src={p.avatar} alt={p.name} />
                                        <div className={`rank-dot ${p.rank?.tier?.toLowerCase() || 'bronze'}`}></div>
                                    </div>
                                    <div className="player-info">
                                        <h4>{p.name} {p.userId === user._id ? '(You)' : ''}</h4>
                                        <span className="player-rank">{p.rank?.tier || 'Bronze'} {p.rank?.level || 1}</span>
                                    </div>
                                    {p.userId !== user._id && (
                                        <button className="challenge-btn" onClick={() => handleChallenge(p.socketId, p.userId)}>
                                            Challenge
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {view === 'results' && (
                    <div className="battle-results-overlay">
                        {/* Results UI Logic matching the Rank Progression design */}
                        <h2>Battle Results</h2>
                        <button className="back-lobby-btn" onClick={() => setView('selection')}>Return to Arena</button>
                    </div>
                )}
            </div>

            {incomingChallenge && (
                <div className="challenge-modal">
                    <div className="challenge-card">
                        <LuSword className="shake-anim" />
                        <h3>{incomingChallenge.challengerName} has challenged you!</h3>
                        <p>Topic: {incomingChallenge.topic}</p>
                        <div className="challenge-actions">
                            <button className="accept-btn" onClick={() => {
                                if (socket) {
                                    socket.emit('battle:respond_challenge', { challengerSocketId: incomingChallenge.challengerSocketId, accept: true, topic: incomingChallenge.topic });
                                }
                            }}>Accept</button>
                            <button className="reject-btn" onClick={() => setIncomingChallenge(null)}>Decline</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BattleArena;
