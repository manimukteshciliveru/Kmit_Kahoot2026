import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { toast } from 'react-hot-toast';
import { FiZap, FiUser, FiActivity, FiX, FiInfo, FiAward } from 'react-icons/fi';
import './BattleArena.css';

const BattleArena = () => {
    const { user } = useAuth();
    const { socket, connected, on, emit } = useSocket();
    
    const [mode, setMode] = useState('lobby'); // lobby, searching, fighting, result
    const [battleData, setBattleData] = useState(null);
    const [opponentData, setOpponentData] = useState({ score: 0, progress: 0 });
    const [currentIndex, setCurrentIndex] = useState(0);
    const [myScore, setMyScore] = useState(0);
    const [results, setResults] = useState(null);
    const [questionStartTime, setQuestionStartTime] = useState(null);

    // Matching timer
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
            toast.success('Match Found! Battle Starts Now!');
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

        on('battle:cancelled', () => setMode('lobby'));

        return () => {
            clearInterval(searchInterval.current);
        };
    }, [on]);

    // Handle Tab Switch (Anti-Cheat)
    useEffect(() => {
        if (mode !== 'fighting') return;

        const handleVisibility = () => {
            if (document.hidden) {
                emit('battle:tab_switch', { battleId: battleData.battleId });
                setMode('result');
                toast.error('Disqualified for switching tabs!');
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [mode, battleData, emit]);

    const startSearch = () => {
        emit('battle:find_match');
        setSearchTime(0);
        searchInterval.current = setInterval(() => {
            setSearchTime(prev => prev + 1);
        }, 1000);
    };

    const cancelSearch = () => {
        emit('battle:leave_queue');
        clearInterval(searchInterval.current);
        setMode('lobby');
    };

    const submitAnswer = (answer) => {
        const timeTaken = Date.now() - questionStartTime;
        
        emit('battle:submit_answer', {
            battleId: battleData.battleId,
            questionIndex: currentIndex,
            answer,
            timeTaken
        });

        // Local UI feedback (server will send authoritative update later)
        if (currentIndex < battleData.quiz.questions.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setQuestionStartTime(Date.now());
        } else {
            // Waiting for opponent to finish
            toast('Waiting for opponent...', { icon: '⏳' });
        }
    };

    if (!connected) return <div className="battle-error">Connecting to Arena Server...</div>;

    return (
        <div className="battle-arena">
            {mode === 'lobby' && (
                <div className="lobby-view animate-fadeIn">
                    <div className="arena-hero">
                        <FiZap className="hero-icon" />
                        <h1>1v1 Quiz Battle</h1>
                        <p>Challenge a random student in a real-time knowledge duel!</p>
                    </div>
                    <button className="btn-find-match" onClick={startSearch}>
                        Enter the Queue
                    </button>
                    <div className="arena-stats">
                        <div className="a-stat"><FiUser /> <span>{user.name}</span></div>
                        <div className="a-stat"><FiAward /> <span>Rank: Gold II</span></div>
                    </div>
                </div>
            )}

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
                    
                    <button className="btn-return" onClick={() => setMode('lobby')}>Return to Lobby</button>
                </div>
            )}
        </div>
    );
};

export default BattleArena;
