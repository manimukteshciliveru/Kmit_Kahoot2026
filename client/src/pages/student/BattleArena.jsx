import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { toast } from 'react-hot-toast';
import { FiZap, FiUser, FiActivity, FiX, FiInfo, FiAward, FiGlobe, FiUsers, FiCheck, FiSlash } from 'react-icons/fi';
import './BattleArena.css';

const BattleArena = () => {
    const { user } = useAuth();
    const { socket, connected, on, emit } = useSocket();
    
    const [mode, setMode] = useState('selection'); // selection, searching, lobby, fighting, result
    const [battleData, setBattleData] = useState(null);
    const [opponentData, setOpponentData] = useState({ score: 0, progress: 0 });
    const [currentIndex, setCurrentIndex] = useState(0);
    const [myScore, setMyScore] = useState(0);
    const [results, setResults] = useState(null);
    const [questionStartTime, setQuestionStartTime] = useState(null);

    // Lobby & Matchmaking
    const [lobbyPlayers, setLobbyPlayers] = useState([]);
    const [incomingChallenge, setIncomingChallenge] = useState(null);
    const [searchTime, setSearchTime] = useState(0);
    const searchInterval = useRef(null);

    useEffect(() => {
        if (!on) return;

        on('battle:searching', () => setMode('searching'));
        
        on('battle:started', (data) => {
            setBattleData(data);
            setMode('fighting');
            setCurrentIndex(0);
            setMyScore(0);
            setOpponentData({ score: 0, progress: 0 });
            setQuestionStartTime(Date.now());
            setIncomingChallenge(null);
            toast.success('Battle Starts Now!');
        });

        on('battle:opponent_update', (data) => {
            setOpponentData({
                score: data.opponentScore,
                progress: data.questionIndex + 1
            });
        });

        on('battle:ended', (data) => {
            setResults(data);
            setMode('result');
            if (data.reason) toast.error(data.reason);
        });

        on('battle:cancelled', () => setMode('selection'));
        
        on('battle:lobby_update', (lobby) => {
            setLobbyPlayers(lobby.filter(p => p.userId !== user._id));
        });

        on('battle:no_players', (data) => {
            toast.error(data.message);
            cancelSearch();
        });

        on('battle:incoming_challenge', (data) => {
            setIncomingChallenge(data);
            toast(`Challenge from ${data.challengerName}!`, { icon: '💌', duration: 10000 });
        });

        on('battle:challenge_rejected', (data) => {
            toast.error(data.message);
        });

        return () => {
            clearInterval(searchInterval.current);
        };
    }, [on, user._id]);

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

    const challengePlayer = (targetSocketId) => {
        emit('battle:challenge_player', { targetSocketId });
        toast.success('Invitation sent!');
    };

    const respondToChallenge = (accept) => {
        if (!incomingChallenge) return;
        emit('battle:respond_challenge', {
            challengerSocketId: incomingChallenge.challengerSocketId,
            accept
        });
        if (!accept) setIncomingChallenge(null);
    };

    const submitAnswer = (answer) => {
        const timeTaken = Date.now() - questionStartTime;
        emit('battle:submit_answer', {
            battleId: battleData.battleId,
            questionIndex: currentIndex,
            answer,
            timeTaken
        });

        if (currentIndex < battleData.quiz.questions.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setQuestionStartTime(Date.now());
        } else {
            toast('Waiting for opponent...', { icon: '⏳' });
        }
    };

    if (!connected) return <div className="battle-error">Connecting to Arena Server...</div>;

    return (
        <div className="battle-arena">
            {/* ── SELECTION VIEW ── */}
            {mode === 'selection' && (
                <div className="lobby-view animate-fadeIn">
                    <div className="arena-hero">
                        <FiZap className="hero-icon" />
                        <h1>1v1 Quiz Battle</h1>
                        <p>Challenge a student in a real-time knowledge duel!</p>
                    </div>
                    
                    <div className="battle-modes">
                        <div className="mode-option" onClick={startRandomSearch}>
                            <FiGlobe className="mode-icon" />
                            <h3>Quick Match</h3>
                            <p>Randomly connect to anyone waiting</p>
                            <button className="btn-mode-select">Find Opponent</button>
                        </div>
                        <div className="mode-option" onClick={enterChooseLobby}>
                            <FiUsers className="mode-icon" />
                            <h3>Choose Opponent</h3>
                            <p>Browse students currently in lobby</p>
                            <button className="btn-mode-select secondary">View Lobby</button>
                        </div>
                    </div>

                    <div className="arena-stats">
                        <div className="a-stat"><FiUser /> <span>{user.name}</span></div>
                        <div className="a-stat"><FiAward /> <span>Rank: Gold II</span></div>
                    </div>
                </div>
            )}

            {/* ── SEARCHING VIEW ── */}
            {mode === 'searching' && (
                <div className="searching-view animate-pulse">
                    <div className="search-spinner"></div>
                    <h2>Searching for Opponent...</h2>
                    <p>Time elapsed: {searchTime}s</p>
                    <button className="btn-cancel" onClick={cancelSearch}>Cancel</button>
                    <div className="matching-tips">
                        <FiInfo /> Tip: Faster answers earn more points!
                    </div>
                </div>
            )}

            {/* ── LOBBY VIEW ── */}
            {mode === 'lobby' && (
                <div className="lobby-browser">
                    <div className="lobby-header">
                        <h2>Battle Lobby</h2>
                        <button className="btn-back" onClick={cancelSearch}>Back</button>
                    </div>
                    
                    {lobbyPlayers.length === 0 ? (
                        <div className="empty-lobby">
                            <FiUser className="empty-icon" />
                            <h3>Lobby is quiet...</h3>
                            <p>No other players are currently in the lobby. Invite a friend or try Quick Match!</p>
                            <button className="btn-quick-switch" onClick={startRandomSearch}>Try Quick Match</button>
                        </div>
                    ) : (
                        <div className="lobby-list">
                            {lobbyPlayers.map(p => (
                                <div key={p.socketId} className="lobby-player-card">
                                    <img src={p.avatar || `https://ui-avatars.com/api/?name=${p.name}`} alt={p.name} />
                                    <div className="p-details">
                                        <h4>{p.name}</h4>
                                        <span>Status: Ready to Fight</span>
                                    </div>
                                    <button className="btn-challenge" onClick={() => challengePlayer(p.socketId)}>Challenge</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── CHALLENGE MODAL ── */}
            {incomingChallenge && mode !== 'fighting' && (
                <div className="challenge-overlay">
                    <div className="challenge-card animate-bounceIn">
                        <div className="challenge-badge">NEW CHALLENGE!</div>
                        <img src={`https://ui-avatars.com/api/?name=${incomingChallenge.challengerName}`} alt="Challenger" />
                        <h3>{incomingChallenge.challengerName}</h3>
                        <p>wants to battle you!</p>
                        <div className="challenge-actions">
                            <button className="btn-accept" onClick={() => respondToChallenge(true)}>
                                <FiCheck /> Accept
                            </button>
                            <button className="btn-reject" onClick={() => respondToChallenge(false)}>
                                <FiSlash /> Decline
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── FIGHTING VIEW ── */}
            {mode === 'fighting' && battleData && (
                <div className="fighting-view">
                    <div className="battle-header">
                        <div className="player-stats me">
                            <img src={user.avatar || `https://ui-avatars.com/api/?name=${user.name}`} alt="You" />
                            <div className="p-info">
                                <span>YOU</span>
                                <h3>{opponentData.score === 0 && myScore === 0 ? "0" : "Syncing..."}</h3>
                            </div>
                        </div>
                        <div className="vs-logo">VS</div>
                        <div className="player-stats enemy">
                            <div className="p-info">
                                <span>OPPONENT</span>
                                <h3>{opponentData.score}</h3>
                            </div>
                            <img src={`https://ui-avatars.com/api/?name=Opponent`} alt="Opponent" />
                        </div>
                    </div>

                    <div className="battle-progress-grid">
                        <div className="progress-bar-label">Your Progress: {currentIndex + 1}/{battleData.quiz.questions.length}</div>
                        <div className="progress-bar-bg"><div className="progress-fill my" style={{width: `${((currentIndex+1)/battleData.quiz.questions.length)*100}%`}}></div></div>
                        
                        <div className="progress-bar-label">Opponent Progress: {opponentData.progress}/{battleData.quiz.questions.length}</div>
                        <div className="progress-bar-bg"><div className="progress-fill enemy" style={{width: `${(opponentData.progress/battleData.quiz.questions.length)*100}%`}}></div></div>
                    </div>

                    <div className="battle-question-card animate-fadeInUp">
                        <div className="q-index">Question {currentIndex + 1}</div>
                        <h2>{battleData.quiz.questions[currentIndex].text}</h2>
                        <div className="battle-options">
                            {battleData.quiz.questions[currentIndex].options.map((opt, i) => (
                                <button key={i} className="battle-opt-btn" onClick={() => submitAnswer(opt)}>
                                    {opt}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── RESULT VIEW ── */}
            {mode === 'result' && results && (
                <div className="result-view animate-zoomIn">
                    {results.winnerId === user._id ? (
                        <div className="victory-card">
                            <div className="crown">👑</div>
                            <h1>VICTORY!</h1>
                            <p>You dominated the arena.</p>
                        </div>
                    ) : (
                        <div className="defeat-card">
                            <h1>DEFEAT</h1>
                            <p>{results.reason || "Better luck next time, warrior."}</p>
                        </div>
                    )}
                    <div className="final-scoreboard">
                        {results.finalScores.map((s, i) => (
                            <div key={i} className={`score-row ${s.name === user.name ? 'highlight' : ''}`}>
                                <span>{s.name}</span>
                                <strong>{s.score} pts</strong>
                            </div>
                        ))}
                    </div>
                    <button className="btn-return" onClick={() => setMode('selection')}>Return to Lobby</button>
                </div>
            )}
        </div>
    );
};

export default BattleArena;
