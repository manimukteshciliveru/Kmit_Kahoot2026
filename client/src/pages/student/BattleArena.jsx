import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { toast } from 'react-hot-toast';
import { FiZap, FiUser, FiActivity, FiX, FiInfo, FiAward, FiGlobe, FiUsers, FiCheck, FiSlash, FiFilter, FiBookOpen, FiClock } from 'react-icons/fi';
import './BattleArena.css';

const BattleArena = () => {
    const { user } = useAuth();
    const { socket, connected, on, emit } = useSocket();
    
    const [mode, setMode] = useState('selection'); // selection, searching, lobby, voting, fighting, result
    const [battleData, setBattleData] = useState(null);
    const [opponentData, setOpponentData] = useState({ score: 0, progress: 0 });
    const [currentIndex, setCurrentIndex] = useState(0);
    const [myScore, setMyScore] = useState(0);
    const [results, setResults] = useState(null);
    const [questionStartTime, setQuestionStartTime] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const timerInterval = useRef(null);

    // Lobby & Matchmaking
    const [lobbyPlayers, setLobbyPlayers] = useState([]);
    const [selectedTopic, setSelectedTopic] = useState('');
    const [incomingChallenge, setIncomingChallenge] = useState(null);
    const [votingData, setVotingData] = useState(null);
    const [searchTime, setSearchTime] = useState(0);
    const searchInterval = useRef(null);

    const TOPICS = ['HTML/CSS', 'JavaScript', 'React', 'Node.js', 'Python', 'Java', 'Database', 'General'];

    useEffect(() => {
        if (!on) return;

        on('battle:searching', () => setMode('searching'));
        
        on('battle:started', (data) => {
            setBattleData(data);
            setMode('fighting');
            setCurrentIndex(0);
            setMyScore(0);
            setOpponentData({ score: 0, progress: 0 });
            setIncomingChallenge(null);
            setVotingData(null);
            startQuestion(0, data.quiz.questions, data.quiz.settings);
            toast.success('Battle Starts Now!');
        });

        on('battle:score_sync', (data) => {
            setMyScore(data.newScore);
        });

        on('battle:opponent_update', (data) => {
            setOpponentData({
                score: data.opponentScore,
                progress: data.questionIndex + 1
            });
        });

        on('battle:ended', (data) => {
            clearInterval(timerInterval.current);
            setResults(data);
            setMode('result');
            if (data.reason) toast.error(data.reason);
        });

        on('battle:cancelled', () => {
            clearInterval(timerInterval.current);
            setMode('selection');
        });
        
        on('battle:lobby_update', (lobby) => {
            // Filter out self and handle 'You' indicator for current player in list if needed
            setLobbyPlayers(lobby);
        });

        on('battle:no_players', (data) => {
            toast.error(data.message);
            cancelSearch();
        });

        on('battle:incoming_challenge', (data) => {
            setIncomingChallenge(data);
            toast(`Challenge from ${data.challengerName}!`, { icon: '💌', duration: 15000 });
        });

        on('battle:challenge_rejected', (data) => {
            toast.error(data.message);
        });

        on('battle:topic_voting', (data) => {
            setVotingData(data);
            setMode('voting');
            clearInterval(searchInterval.current);
        });

        return () => {
            clearInterval(searchInterval.current);
            clearInterval(timerInterval.current);
        };
    }, [on]);

    const startQuestion = (index, questions, settings) => {
        const timeLimit = settings?.timeLimit || 30;
        setTimeLeft(timeLimit);
        setQuestionStartTime(Date.now());
        
        clearInterval(timerInterval.current);
        timerInterval.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerInterval.current);
                    handleAnswer(null); // Time's up!
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const handleAnswer = (answer) => {
        clearInterval(timerInterval.current);
        const timeTaken = Date.now() - questionStartTime;
        
        emit('battle:submit_answer', {
            battleId: battleData.battleId,
            questionIndex: currentIndex,
            answer,
            timeTaken
        });

        if (currentIndex < battleData.quiz.questions.length - 1) {
            const nextIdx = currentIndex + 1;
            setCurrentIndex(nextIdx);
            startQuestion(nextIdx, battleData.quiz.questions, battleData.quiz.settings);
        } else {
            setMode('waiting_finish');
            toast('Waiting for opponent...', { icon: '⏳' });
        }
    };

    const startRandomSearch = () => {
        emit('battle:enter_lobby', { mode: 'random' });
        setSearchTime(0);
        setMode('searching');
        searchInterval.current = setInterval(() => {
            setSearchTime(prev => prev + 1);
        }, 1000);
    };

    const enterChooseLobby = () => {
        emit('battle:enter_lobby', { mode: 'choose' });
        setMode('lobby');
    };

    const cancelSearch = () => {
        emit('battle:leave_queue');
        clearInterval(searchInterval.current);
        setMode('selection');
    };

    const handleChallenge = (targetSocketId, targetUserId) => {
        if (targetUserId === user._id) {
            toast.error("You can't challenge yourself!");
            return;
        }
        if (!selectedTopic) {
            toast.error('Choose a topic first!');
            return;
        }
        emit('battle:challenge_player', { targetSocketId, topic: selectedTopic });
        toast.success(`Invitation sent!`);
    };

    const submitVote = (topic, type) => {
        const opponent = votingData.players.find(p => p.socketId !== socket.id);
        emit('battle:submit_vote', {
            opponentSocketId: opponent.socketId,
            topic,
            voteType: type
        });
        toast.success('Vote submitted!');
    };

    const respondToChallenge = (accept) => {
        if (!incomingChallenge) return;
        emit('battle:respond_challenge', {
            challengerSocketId: incomingChallenge.challengerSocketId,
            accept,
            topic: incomingChallenge.topic
        });
        if (!accept) setIncomingChallenge(null);
    };

    if (!connected) return <div className="battle-error">Connecting to Arena Server...</div>;

    return (
        <div className="battle-arena">
            {/* ── SELECTION VIEW ── */}
            {mode === 'selection' && (
                <div className="selection-view animate-fadeIn">
                    <div className="arena-hero">
                        <FiZap className="hero-icon" />
                        <h1>1v1 Battle Arena</h1>
                        <p>Dominate the leaderboard in real-time duels</p>
                    </div>
                    
                    <div className="battle-modes">
                        <div className="mode-card quick" onClick={startRandomSearch}>
                            <FiGlobe className="m-icon" />
                            <h3>Quick Match</h3>
                            <span>Connect instantly</span>
                        </div>
                        <div className="mode-card browse" onClick={enterChooseLobby}>
                            <FiUsers className="m-icon" />
                            <h3>Browse Players</h3>
                            <span>Choose your opponent</span>
                        </div>
                    </div>
                </div>
            )}

            {/* ── SEARCHING VIEW ── */}
            {mode === 'searching' && (
                <div className="searching-container">
                    <div className="radar">
                        <div className="radar-circle"></div>
                        <FiZap className="radar-icon" />
                    </div>
                    <h2>Finding your rival...</h2>
                    <p>{searchTime}s elapsed</p>
                    <button className="btn-abort" onClick={cancelSearch}>Abort Mission</button>
                </div>
            )}

            {/* ── LOBBY VIEW ── */}
            {mode === 'lobby' && (
                <div className="lobby-container">
                    <div className="lobby-nav">
                        <h2>Battle Lobby</h2>
                        <div className="topic-select-wrap">
                            <FiBookOpen />
                            <select value={selectedTopic} onChange={(e) => setSelectedTopic(e.target.value)}>
                                <option value="">Select Topic</option>
                                {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <FiX className="close-lobby" onClick={cancelSearch} />
                    </div>
                    
                    <div className="player-grid">
                        {lobbyPlayers.length <= 1 ? (
                            <div className="no-players">Searching for players online...</div>
                        ) : (
                            lobbyPlayers.map(p => (
                                <div key={p.socketId} className={`p-card ${p.userId === user._id ? 'is-me' : ''}`}>
                                    <img src={p.avatar || `https://ui-avatars.com/api/?name=${p.name}`} alt={p.name} />
                                    <div className="p-info">
                                        <h4>{p.name} {p.userId === user._id && '(You)'}</h4>
                                        <span className="p-status">Ready to Fight</span>
                                    </div>
                                    {p.userId !== user._id ? (
                                        <button className="btn-challenge-sm" onClick={() => handleChallenge(p.socketId, p.userId)}>Challenge</button>
                                    ) : (
                                        <div className="me-badge">YOU</div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* ── VOTING ── */}
            {mode === 'voting' && votingData && (
                <div className="topic-voting-overlay">
                    <div className="voting-modal">
                        <h2>Select Battle Topic</h2>
                        <div className="vote-options-grid">
                            {TOPICS.map(t => (
                                <button key={t} className="vote-option-btn" onClick={() => submitVote(t, 'suggest')}>{t}</button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── CHALLENGE MODAL ── */}
            {incomingChallenge && mode !== 'fighting' && (
                <div className="challenge-popup-wrap">
                    <div className="challenge-popup">
                        <div className="c-pulse"></div>
                        <h3>Challenge Received!</h3>
                        <p><strong>{incomingChallenge.challengerName}</strong> wants to battle in <strong>{incomingChallenge.topic}</strong></p>
                        <div className="c-actions">
                            <button className="btn-c-accept" onClick={() => respondToChallenge(true)}>Fight</button>
                            <button className="btn-c-decline" onClick={() => respondToChallenge(false)}>Decline</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── FIGHTING VIEW ── */}
            {(mode === 'fighting' || mode === 'waiting_finish') && battleData && (
                <div className="battle-field">
                    <div className="battle-hud">
                        <div className="hud-player left">
                            <div className="hud-avatar"><img src={user.avatar || `https://ui-avatars.com/api/?name=${user.name}`} alt="Me" /></div>
                            <div className="hud-meta">
                                <span>{user.name}</span>
                                <strong>{myScore}</strong>
                            </div>
                        </div>
                        
                        <div className="hud-center">
                            <div className="timer-circle">
                                <svg viewBox="0 0 36 36">
                                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#444" strokeWidth="2" strokeDasharray="100, 100" />
                                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#FDE047" strokeWidth="2" strokeDasharray={`${(timeLeft / (battleData.quiz.settings?.timeLimit || 30)) * 100}, 100`} />
                                </svg>
                                <span>{timeLeft}</span>
                            </div>
                        </div>

                        <div className="hud-player right">
                            <div className="hud-meta">
                                <span>{opponentData.progress >= battleData.quiz.questions.length ? 'FINISHED' : 'OPPONENT'}</span>
                                <strong>{opponentData.score}</strong>
                            </div>
                            <div className="hud-avatar"><img src={`https://ui-avatars.com/api/?name=Opponent`} alt="Opponent" /></div>
                        </div>
                    </div>

                    <div className="progress-trackers">
                        <div className="track me"><div className="fill" style={{width: `${(currentIndex / battleData.quiz.questions.length) * 100}%`}}></div></div>
                        <div className="track enemy"><div className="fill" style={{width: `${(opponentData.progress / battleData.quiz.questions.length) * 100}%`}}></div></div>
                    </div>

                    {mode === 'fighting' ? (
                        <div className="q-arena animate-fadeIn">
                            <div className="question-header">
                                <span className="cat">{battleData.quiz.title}</span>
                                <h2>{battleData.quiz.questions[currentIndex].text}</h2>
                            </div>
                            <div className="options-kahoot-grid">
                                {battleData.quiz.questions[currentIndex].options.map((opt, i) => (
                                    <button key={i} className={`opt-btn color-${i}`} onClick={() => handleAnswer(opt)}>
                                        <span className="shape"></span>
                                        <span className="text">{opt}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="waiting-finish-screen">
                            <div className="loader"></div>
                            <h2>Waiting for opponent to finish...</h2>
                            <p>Current Score: {myScore} pts</p>
                        </div>
                    )}
                </div>
            )}

            {/* ── RESULT VIEW ── */}
            {mode === 'result' && results && (
                <div className="final-screen animate-zoomIn">
                    {results.winnerId === user._id ? (
                        <div className="victory-splash">
                            <div className="confetti"></div>
                            <h1>VICTORY!</h1>
                            <p>Master of the Domain</p>
                        </div>
                    ) : (
                        <div className="defeat-splash">
                            <h1>DEFEAT</h1>
                            <p>{results.reason || "The battle is lost, but the war continues."}</p>
                        </div>
                    )}
                    
                    <div className="podium-scores">
                        {results.finalScores.sort((a,b) => b.score - a.score).map((s, i) => (
                            <div key={i} className={`score-card rank-${i}`}>
                                <span className="rank-num">#{i+1}</span>
                                <span className="p-name">{s.name}</span>
                                <span className="p-points">{s.score} pts</span>
                            </div>
                        ))}
                    </div>
                    
                    <button className="btn-lobby-return" onClick={() => setMode('selection')}>Return to Base</button>
                </div>
            )}
        </div>
    );
};

export default BattleArena;
