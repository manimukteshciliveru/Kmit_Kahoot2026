import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiCopy, FiUsers, FiPlay, FiStopCircle, FiChevronRight, FiAward, FiClock, FiCheck, FiBarChart2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useSocket } from '../../context/SocketContext';
import { quizAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import './HostQuiz.css';

const HostQuiz = () => {
    const { quizId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { socket } = useSocket();

    const [quiz, setQuiz] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [status, setStatus] = useState('loading'); // loading, ready, active, completed
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answeredCount, setAnsweredCount] = useState(0);
    const [leaderboard, setLeaderboard] = useState([]);
    const [activeTab, setActiveTab] = useState('stats'); // stats, leaderboard, attendance
    const [answeredParticipants, setAnsweredParticipants] = useState([]);
    const [cheatingAlerts, setCheatingAlerts] = useState([]);
    const [timeLeft, setTimeLeft] = useState(0);

    useEffect(() => {
        if (user && user.role === 'student') {
            navigate(`/quiz/${quizId}/play`);
            return;
        }

        const fetchQuiz = async () => {
            try {
                const response = await quizAPI.getById(quizId);
                const data = response.data.data.quiz;
                setQuiz(data);
                setParticipants(Array.isArray(data.participants) ? data.participants : []);
                setStatus(data.status === 'active' ? 'active'
                    : (data.status === 'completed' || data.status === 'finished') ? 'completed'
                        : (data.status === 'scheduled') ? 'scheduled'
                            : 'ready');
                if (data.currentQuestionIndex >= 0) {
                    setCurrentQuestionIndex(data.currentQuestionIndex);
                }

                if (data.status === 'scheduled' && data.scheduledAt) {
                    const scheduledTime = new Date(data.scheduledAt).getTime();
                    const now = Date.now();
                    const diff = Math.floor((scheduledTime - now) / 1000);
                    setTimeLeft(Math.max(0, diff));
                } else if (data.status === 'active' && data.expiresAt) {
                    const expires = new Date(data.expiresAt).getTime();
                    const now = Date.now();
                    setTimeLeft(Math.max(0, Math.floor((expires - now) / 1000)));
                } else if (data.status === 'active' && data.startedAt) {
                    const start = new Date(data.startedAt).getTime();
                    if (!isNaN(start)) {
                        const elapsed = Math.floor((Date.now() - start) / 1000);
                        const duration = parseInt(data.settings?.quizTimer) || 0;
                        if (duration > 0) {
                            setTimeLeft(Math.max(0, duration - elapsed));
                        }
                    }
                }
            } catch (error) {
                console.error("Fetch error:", error);
                toast.error('Failed to load quiz');
                navigate('/dashboard');
            }
        };
        fetchQuiz();
    }, [quizId, navigate, user]);

    // Socket listener for events
    useEffect(() => {
        if (!socket || !quizId) return;

        socket.emit('quiz:join', { quizId });

        const handleQuizJoined = (data) => {
            setParticipants(data.participants || []);
        };

        const handleParticipantJoined = (data) => {
            setParticipants(prev => {
                const participant = data.participant;
                if (prev.find(p => String(p.id || p._id) === String(participant.id))) return prev;
                return [...prev, participant];
            });
            toast.success(`${data.participant?.name} joined!`);
        };

        const handleQuizStarted = (data) => {
            setStatus('active');
            setCurrentQuestionIndex(0);
            setActiveTab('stats');
            if (data.expiresAt) {
                const expires = new Date(data.expiresAt).getTime();
                setTimeLeft(Math.max(0, Math.floor((expires - Date.now()) / 1000)));
            } else if (data.settings?.quizTimer) {
                setTimeLeft(data.settings.quizTimer);
            }
        };

        const handleResponseReceived = (data) => {
            setAnsweredCount(prev => prev + 1);
            setAnsweredParticipants(prev => [...new Set([...prev, data.participantId])]);
        };

        const handleLeaderboardUpdate = (data) => {
            setLeaderboard(data.leaderboard || []);
        };

        const handleTabSwitch = (data) => {
            toast.error(`${data.participantName} switched tabs!`, { icon: '⚠️' });
            setCheatingAlerts(prev => [{ ...data, time: new Date() }, ...prev].slice(0, 5));

            // IMMEDIATE FIX: Manually lower trust score locally for instant feedback
            setParticipants(prev => prev.map(p => {
                if (String(p.id || p._id) === String(data.participantId)) {
                    const currentScore = p.trustScore !== undefined ? p.trustScore : 100;
                    return { ...p, trustScore: Math.max(0, currentScore - 20) }; // Heavy penalty for visibility
                }
                return p;
            }));
        };

        const handleQuizEnded = (data) => {
            setStatus('completed');
            setLeaderboard(data.leaderboard || []);
            setActiveTab('leaderboard');
        };

        const handleParticipantFlagged = (data) => {
            toast.error(`Security Alert: ${data.participantName || 'Student'} flagged`, { icon: '🛡️' });
            setCheatingAlerts(prev => [{
                participantName: data.participantName,
                reason: data.reason,
                time: new Date()
            }, ...prev].slice(0, 10));

            // Update participant trust score locally
            setParticipants(prev => prev.map(p => {
                if (String(p.id || p._id) === String(data.participantId)) {
                    return { ...p, trustScore: data.score };
                }
                return p;
            }));
        };

        socket.on('quiz:joined', handleQuizJoined);
        socket.on('participant:joined', handleParticipantJoined);
        socket.on('quiz:started', handleQuizStarted);
        socket.on('response:received', handleResponseReceived);
        socket.on('leaderboard:update', handleLeaderboardUpdate);
        socket.on('participant:tabswitch', handleTabSwitch);
        socket.on('participant:flagged', handleParticipantFlagged);
        socket.on('quiz:ended', handleQuizEnded);

        return () => {
            socket.off('quiz:joined', handleQuizJoined);
            socket.off('participant:joined', handleParticipantJoined);
            socket.off('quiz:started', handleQuizStarted);
            socket.off('response:received', handleResponseReceived);
            socket.off('leaderboard:update', handleLeaderboardUpdate);
            socket.off('participant:tabswitch', handleTabSwitch);
            socket.off('participant:flagged', handleParticipantFlagged);
            socket.off('quiz:ended', handleQuizEnded);
        };
    }, [socket, quizId]);

    // Timer logic & Auto-End
    useEffect(() => {
        if ((status !== 'active' && status !== 'scheduled') || timeLeft <= 0) return;

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    if (status === 'scheduled') {
                        // Refresh to check if started
                        window.location.reload();
                        return 0;
                    }
                    if (status === 'active') {
                        // Auto-end quiz
                        handleEndQuiz();
                        return 0;
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [status, timeLeft > 0]);

    // Auto-navigate to results when completed
    useEffect(() => {
        if (status === 'completed') {
            const timer = setTimeout(() => {
                navigate(`/quiz/${quizId}/results`);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [status, navigate, quizId]);

    const formatTime = (seconds) => {
        if (isNaN(seconds) || seconds < 0) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleStartQuiz = async () => {
        if (participants.length === 0) {
            if (!window.confirm("No students joined. Start anyway?")) return;
        }
        try {
            await quizAPI.start(quizId);
            setStatus('active');
            toast.success('Quiz Started!');
        } catch (error) {
            toast.error('Failed to start quiz');
        }
    };

    const handleEndQuiz = async () => {
        if (window.confirm("End quiz now?")) {
            try {
                await quizAPI.end(quizId);
                setStatus('completed');
                toast.success('Quiz Ended');
            } catch (error) {
                toast.error('Failed to end quiz');
            }
        }
    };

    const handleResetQuiz = async () => {
        if (!window.confirm("Are you sure you want to host this quiz again? This will clear all previous session data.")) return;
        try {
            await quizAPI.reset(quizId);
            // Validate state update
            setStatus('ready');
            setQuiz(prev => ({ ...prev, status: 'draft', startedAt: null, endedAt: null }));
            setTimeLeft(0);
            setParticipants([]);
            setLeaderboard([]);
            setAnsweredParticipants([]);
            setCheatingAlerts([]);
            toast.success('Quiz reset! Ready to host.');
        } catch (error) {
            console.error('Reset functionality failed:', error);
            toast.error('Failed to reset quiz. Please check server logs.');
        }
    };

    const copyPIN = () => {
        navigator.clipboard.writeText(quiz?.code);
        toast.success('PIN copied!');
    };

    if (!quiz) return <div className="loading-container"><div className="loading-spinner"></div><p>Loading Quiz...</p></div>;

    const totalQuestions = quiz.questions?.length || 0;

    // Lobby View
    if (status === 'ready' || status === 'scheduled') {
        const isScheduled = status === 'scheduled';
        return (
            <div className="host-quiz-page">
                <div className="host-lobby">
                    <div className="lobby-header">
                        <h1>{quiz.title}</h1>
                        <p>Join with Game PIN</p>
                    </div>
                    <div className="pin-container" onClick={copyPIN}>
                        <div className="pin-box">
                            <span className="pin-title">PIN:</span>
                            <span className="pin-code">{quiz.code}</span>
                        </div>
                    </div>
                    <div className="lobby-content">
                        <div className="lobby-status-bar">
                            <div className="player-count"><FiUsers /> <span>{participants.length} Players</span></div>
                            <div className={`status-indicator ${status}`}>{status === 'scheduled' ? 'Scheduled' : 'Waiting...'}</div>
                        </div>
                        <div className="participants-area">
                            <div className="participants-list">
                                {participants.map((p, idx) => (
                                    <div key={idx} className="participant-card">
                                        <div className="participant-avatar">{p.name?.charAt(0)}</div>
                                        <span className="participant-name">{p.name}</span>
                                    </div>
                                ))}
                                {participants.length === 0 && <p>No one here yet...</p>}
                            </div>
                        </div>
                    </div>
                    <div className="lobby-actions">
                        {isScheduled ? (
                            <div className="scheduled-timer">
                                {/* Timer hidden as per request */}
                                {/* <h3>Quiz Starts In:</h3> */}
                                {/* <div className="timer-display giant">{formatTime(timeLeft)}</div> */}
                                <p className="scheduled-hint">This quiz is scheduled to start automatically.</p>
                                <button className="btn btn-primary btn-xl" onClick={handleStartQuiz}>Start Now (Override)</button>
                            </div>
                        ) : (
                            <button className="btn btn-primary btn-xl" onClick={handleStartQuiz}>Start Quiz</button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="host-quiz-page">
            <div className="host-active">
                <div className="active-header">
                    <div className="host-nav-tabs">
                        <button className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}>Live Stats</button>
                        <button className={`tab-btn ${activeTab === 'leaderboard' ? 'active' : ''}`} onClick={() => setActiveTab('leaderboard')}>Live Dashboard</button>
                        <button className={`tab-btn ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => setActiveTab('attendance')}>Attendance</button>
                        <button className={`tab-btn ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>Security 🛡️</button>
                    </div>
                    <div className="quiz-info-pill">
                        <span>{quiz.title}</span>
                        {status === 'active' && timeLeft > 0 && (
                            <div className={`host-timer ${timeLeft < 60 ? 'critical' : ''}`}>
                                <FiClock /> {formatTime(timeLeft)}
                            </div>
                        )}
                        <div className="live-badge"><span className="live-dot"></span> {status.toUpperCase()}</div>
                    </div>
                    <div className="host-actions">
                        {status === 'active' && <button className="btn btn-danger btn-sm" onClick={handleEndQuiz}>End</button>}
                        {status === 'completed' && (
                            <div className="action-group">
                                <button className="btn btn-secondary btn-sm" onClick={handleResetQuiz}>Re-Host</button>
                                <button className="btn btn-primary btn-sm" onClick={() => navigate(`/quiz/${quizId}/results`)}>Report</button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="tab-content-area">
                    {activeTab === 'stats' && (
                        <div className="stats-view animate-fadeIn">
                            <div className="stats-grid">
                                <div className="stat-card large">
                                    <div className="stat-icon"><FiClock /></div>
                                    <div className="stat-info">
                                        <h3>Progress</h3>
                                        <p>Global Session Status: {status.toUpperCase()}</p>
                                        <div className="progress-bar-container">
                                            <div className="progress-bar-fill" style={{ width: status === 'completed' ? '100%' : '50%' }}></div>
                                        </div>
                                    </div>
                                </div>

                                <div className="stats-row-group">
                                    <div className="stat-card">
                                        <h3>{participants.length}</h3>
                                        <p>Students Joined</p>
                                    </div>
                                    <div className="stat-card highlight">
                                        <h3>{answeredParticipants.length}</h3>
                                        <p>Students Answered</p>
                                    </div>
                                    <div className="stat-card success">
                                        <h3>
                                            {(() => {
                                                // Calculate total eligible students
                                                let totalEligible = participants.length;
                                                if (quiz?.accessControl?.mode === 'SPECIFIC') {
                                                    totalEligible = quiz.accessControl.allowedStudents?.length || participants.length;
                                                }
                                                // If we have total capacity (e.g. strict list), use that. Otherwise joined.
                                                const rate = totalEligible > 0 ? Math.round((answeredParticipants.length / totalEligible) * 100) : 0;
                                                return `${rate}%`;
                                            })()}
                                        </h3>
                                        <p>Participation Rate</p>
                                        <small style={{ opacity: 0.7, fontSize: '0.7em' }}>
                                            ({answeredParticipants.length} Answered / {quiz?.accessControl?.mode === 'SPECIFIC' ? (quiz.accessControl.allowedStudents?.length || 0) + ' Invited' : participants.length + ' Joined'})
                                        </small>
                                    </div>
                                </div>
                            </div>

                            {status === 'active' && (
                                <div className="next-action" style={{ textAlign: 'center', marginTop: '3rem', padding: '2rem', background: 'rgba(255,127,17,0.05)', borderRadius: '20px', border: '1px dashed var(--primary)' }}>
                                    <h2 style={{ color: 'var(--primary)', marginBottom: '1rem' }}>Independent Progression Active</h2>
                                    <p style={{ color: 'var(--text-secondary)' }}>Students are currently navigating through the quiz questions at their own pace.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'leaderboard' && (
                        <div className="leaderboard-view animate-fadeIn live-dashboard-view">
                            <div className="dashboard-head-section">
                                <h2 className="section-title">⚡ Live Dashboard</h2>
                                <div className="live-status-pills">
                                    <span className="live-count-pill"><FiUsers /> {leaderboard.length} Participating</span>
                                    <span className="live-count-pill success"><FiCheck /> {leaderboard.filter(e => e.status === 'completed').length} Completed</span>
                                </div>
                            </div>

                            <div className="attendance-table-container leaderboard-table-scroll live-dashboard-table">
                                <table className="attendance-table leaderboard-styled-table">
                                    <thead>
                                        <tr>
                                            <th>RANK</th>
                                            <th>STUDENT</th>
                                            <th>BRANCH / SEC</th>
                                            <th>TIMING</th>
                                            <th>PROGRESS</th>
                                            <th>STATS</th>
                                            <th className="text-right">SCORE</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(() => {
                                            let currentRank = 0;
                                            let lastScore = -1;
                                            let lastTime = -1;

                                            // Sort locally to ensure live rank updation
                                            const sortedLeaderboard = [...leaderboard].sort((a, b) => b.totalScore - a.totalScore || a.totalTimeTaken - b.totalTimeTaken);

                                            return sortedLeaderboard.map((entry, i) => {
                                                const score = entry.totalScore || 0;
                                                const time = entry.totalTimeTaken || 0;
                                                if (score !== lastScore || time !== lastTime) {
                                                    currentRank = i + 1;
                                                }
                                                lastScore = score;
                                                lastTime = time;
                                                const rank = currentRank;
                                                const s = entry.userId || {};

                                                const totalQs = quiz.questions?.length || 1;
                                                const attempted = entry.answers?.filter(a => a.answer)?.length || 0;
                                                const corrected = entry.correctCount || 0;
                                                const accuracy = attempted > 0 ? Math.round((corrected / attempted) * 100) : 0;
                                                const avgSpeed = entry.averageTimePerQuestion ? (entry.averageTimePerQuestion / 1000).toFixed(1) : '0';

                                                const joinTime = entry.startedAt ? new Date(entry.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '---';
                                                const endTime = entry.status === 'completed' && entry.completedAt ?
                                                    new Date(entry.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) :
                                                    <span className="status-pulse-text">Active...</span>;

                                                return (
                                                    <tr key={i} className={`live-row ${rank <= 3 ? `rank-${rank}-row` : ''} ${user._id === s._id ? 'self-row' : ''}`}>
                                                        <td>
                                                            <div className="rank-display">
                                                                {rank === 1 ? <span className="medal">🥇</span> :
                                                                    rank === 2 ? <span className="medal">🥈</span> :
                                                                        rank === 3 ? <span className="medal">🥉</span> :
                                                                            <span className="rank-number">#{rank}</span>}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div className="student-profile-info">
                                                                <span className="name-bold">{s.name || entry.studentName}</span>
                                                                <span className="roll-mono">{s.rollNumber || '-'}</span>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div className="dept-sec-info">
                                                                <span className="dept-tag">{s.department || 'N/A'}</span>
                                                                <span className="sec-tag">Section {s.section || 'N/A'}</span>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div className="timing-info">
                                                                <div className="time-item"><FiClock className="icon" /> {joinTime} <span className="lbl">Joined</span></div>
                                                                <div className="time-item"><FiStopCircle className="icon" /> {endTime}</div>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div className="progress-metrics">
                                                                <div className="progress-mini-bar">
                                                                    <div className="bar-fill" style={{ width: `${(attempted / totalQs) * 100}%` }}></div>
                                                                </div>
                                                                <span className="progress-txt">{attempted}/{totalQs} Completed</span>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div className="live-stats-metrics">
                                                                <div className="stat-pill accuracy">
                                                                    <FiCheck /> {accuracy}%
                                                                </div>
                                                                <div className="stat-pill speed">
                                                                    <FiZap /> {avgSpeed}s
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="text-right">
                                                            <div className="score-badge-live">
                                                                {score} <span className="pts">pts</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            });
                                        })()}
                                        {leaderboard.length === 0 && (
                                            <tr>
                                                <td colSpan="7" className="empty-table-msg">
                                                    <div className="empty-state-lux">
                                                        <FiBarChart2 className="empty-icon-giant" />
                                                        <p>Waiting for participants to start answering...</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'security' && (
                        <div className="security-view animate-fadeIn">
                            <h2 className="section-title">🛡️ Anti-Cheat Monitor</h2>
                            <div className="security-dashboard-grid">
                                <div className="security-panel">
                                    <h3>Trust Scores</h3>
                                    <div className="trust-score-list">
                                        {participants.sort((a, b) => (b.trustScore || 100) - (a.trustScore || 100)).map((p, i) => (
                                            <div key={i} className={`trust-row ${(p.trustScore || 100) < 50 ? 'critical' : (p.trustScore || 100) < 80 ? 'warning' : 'good'}`}>
                                                <div className="u-info">
                                                    <span className="u-name">{p.name}</span>
                                                    <span className="u-roll">{p.rollNumber}</span>
                                                </div>
                                                <div className="u-score">
                                                    <div className="score-bar-bg">
                                                        <div className="score-bar-fill" style={{ width: `${p.trustScore || 100}%` }}></div>
                                                    </div>
                                                    <span>{p.trustScore || 100}%</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="security-panel logs">
                                    <h3>Recent Alerts</h3>
                                    <div className="alert-feed">
                                        {cheatingAlerts.length === 0 && <p className="no-alerts">No suspicious activity detected.</p>}
                                        {cheatingAlerts.map((alert, idx) => (
                                            <div key={idx} className="alert-card animate-slideIn">
                                                <div className="alert-icon">⚠️</div>
                                                <div className="alert-content">
                                                    <strong>{alert.participantName || 'Unknown User'}</strong>
                                                    <p>{alert.reason || 'Sispicious Activity'}</p>
                                                    <span className="alert-time">{alert.time?.toLocaleTimeString()}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'attendance' && (
                        <div className="attendance-view animate-fadeIn">
                            <h2 className="section-title">👥 Attendance Tracker</h2>
                            <div className="attendance-table-container">
                                <table className="attendance-table">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Roll Number</th>
                                            <th>Branch</th>
                                            <th>Section</th>
                                            <th>Trust Score</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {participants.map((p, i) => (
                                            <tr key={i} className={answeredParticipants.includes(p.id || p._id) ? 'active-row' : ''}>
                                                <td><div className="name-cell"><FiUsers /> {p.name}</div></td>
                                                <td>{p.rollNumber || 'N/A'}</td>
                                                <td>{p.department || 'N/A'}</td>
                                                <td>{p.section || 'N/A'}</td>
                                                <td>
                                                    <span className={`trust-badge ${(p.trustScore || 100) > 80 ? 'high' : 'low'}`}>
                                                        {p.trustScore || 100}%
                                                    </span>
                                                </td>
                                                <td><span className={`status-pill ${answeredParticipants.includes(p.id || p._id) ? 'active' : 'waiting'}`}>
                                                    {answeredParticipants.includes(p.id || p._id) ? 'Active' : 'Joined'}
                                                </span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HostQuiz;
