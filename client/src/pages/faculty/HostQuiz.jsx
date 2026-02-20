import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiCopy, FiUsers, FiPlay, FiStopCircle, FiChevronRight, FiAward, FiClock, FiCheck, FiBarChart2, FiZap } from 'react-icons/fi';
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
    const [status, setStatus] = useState('loading'); // ready, active, completed, leaderboard
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answeredCount, setAnsweredCount] = useState(0);
    const [leaderboard, setLeaderboard] = useState([]);
    const [activeTab, setActiveTab] = useState('leaderboard'); // Default to leaderboard
    const [answeredParticipants, setAnsweredParticipants] = useState([]);
    const [cheatingAlerts, setCheatingAlerts] = useState([]);
    const [timeLeft, setTimeLeft] = useState(0);
    const [attendance, setAttendance] = useState([]);
    const [branchFilter, setBranchFilter] = useState('ALL');
    const [sectionFilter, setSectionFilter] = useState('ALL');

    const BRANCH_CONFIG = {
        'CSE': ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
        'CSM': ['A', 'B', 'C', 'D', 'E']
    };

    // Map internal states to UI states
    const mapStateToUI = (serverStatus) => {
        if (['waiting', 'draft', 'scheduled'].includes(serverStatus)) return serverStatus === 'scheduled' ? 'scheduled' : 'ready';
        if (serverStatus === 'question_active' || serverStatus === 'live') return 'active';
        if (serverStatus === 'leaderboard') return 'active'; // Keep sidebar active
        if (['finished', 'completed', 'done'].includes(serverStatus)) return 'completed';
        return 'ready';
    };

    useEffect(() => {
        if (user && user.role === 'student') {
            navigate(`/quiz/${quizId}/play`);
            return;
        }

        const fetchQuiz = async () => {
            try {
                const [quizRes, lbRes] = await Promise.all([
                    quizAPI.getById(quizId),
                    quizAPI.getLeaderboard(quizId)
                ]);

                const data = quizRes.data.data.quiz;
                setQuiz(data);
                setParticipants(Array.isArray(data.participants) ? data.participants : []);
                setLeaderboard(lbRes.data.data.leaderboard || []);
                setStatus(mapStateToUI(data.status));
                setCurrentQuestionIndex(data.currentQuestionIndex || 0);

                if (data.status === 'scheduled' && data.scheduledAt) {
                    const diff = Math.floor((new Date(data.scheduledAt).getTime() - Date.now()) / 1000);
                    setTimeLeft(Math.max(0, diff));
                }
            } catch (error) {
                console.error('❌ [HOST] Load Error:', error);
                toast.error('Failed to load quiz arena');
                navigate('/dashboard');
            }
        };
        fetchQuiz();
    }, [quizId, navigate, user]);

    useEffect(() => {
        if (!socket || !quizId) return;

        socket.emit('quiz:join', { quizId });

        socket.on('quiz:joined', (data) => setParticipants(data.participants || []));

        socket.on('participant:joined', (data) => {
            setParticipants(prev => {
                const participant = data.participant;
                if (prev.find(p => String(p.id || p._id) === String(participant.id))) return prev;
                return [...prev, participant];
            });
            toast.success(`${data.participant?.name} joined!`);
        });

        socket.on('quiz:state_changed', (data) => {
            console.log('⚡ [STATE] Changed:', data.status);
            setStatus(mapStateToUI(data.status));
            if (data.currentQuestionIndex !== undefined) setCurrentQuestionIndex(data.currentQuestionIndex);
            if (data.leaderboard) setLeaderboard(data.leaderboard);
            if (data.expiresAt) {
                const diff = (new Date(data.expiresAt).getTime() - Date.now()) / 1000;
                setTimeLeft(Math.max(0, Math.floor(diff)));
            }
            if (data.status === 'leaderboard') setActiveTab('leaderboard');
        });

        socket.on('response:received', (data) => {
            console.log('📬 Live Response:', data.participantName, 'Score:', data.score);
            setAnsweredParticipants(prev => [...new Set([...prev, data.participantId])]);
            setAnsweredCount(prev => prev + 1);
        });

        socket.on('leaderboard:update', (data) => {
            if (data.leaderboard) setLeaderboard(data.leaderboard);
        });

        socket.on('student:completed', (data) => {
            toast.success(`${data.name} completed the quiz!`, { icon: '🏁' });
        });

        socket.on('participant:tabswitch', (data) => {
            toast.error(`${data.participantName} switched tabs!`, { icon: '⚠️' });
            setCheatingAlerts(prev => [{ ...data, time: new Date() }, ...prev].slice(0, 5));
        });

        socket.on('quiz:ended', (data) => {
            setStatus('completed');
            setLeaderboard(data.leaderboard || []);
            toast.success('Quiz ended! Preparing report...');
            setTimeout(() => navigate(`/quiz/${quizId}/results`), 2000);
        });

        return () => {
            socket.off('quiz:joined');
            socket.off('participant:joined');
            socket.off('quiz:state_changed');
            socket.off('response:received');
            socket.off('leaderboard:update');
            socket.off('student:completed');
            socket.off('participant:tabswitch');
            socket.off('quiz:ended');
        };
    }, [socket, quizId]);

    // Timer logic
    useEffect(() => {
        if ((status !== 'active' && status !== 'scheduled') || timeLeft <= 0) return;
        const timer = setInterval(() => setTimeLeft(prev => Math.max(0, prev - 1)), 1000);
        return () => clearInterval(timer);
    }, [status, timeLeft]);

    // Attendance logic
    useEffect(() => {
        if (activeTab === 'attendance') {
            const fetchAttendance = async () => {
                try {
                    const res = await quizAPI.getAttendance(quizId);
                    if (res.data.success) {
                        setAttendance(res.data.data);
                    }
                } catch (err) {
                    console.error('Failed to fetch attendance:', err);
                }
            };
            fetchAttendance();
        }
    }, [activeTab, quizId, participants]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Filter Logic
    const getFilteredLeaderboard = () => {
        return leaderboard.filter(entry => {
            const student = entry.userId || {};
            const branchMatch = branchFilter === 'ALL' || student.department === branchFilter;
            const sectionMatch = sectionFilter === 'ALL' || student.section === sectionFilter;
            return branchMatch && sectionMatch;
        });
    };

    const getFilteredAttendance = () => {
        return attendance.filter(entry => {
            const branchMatch = branchFilter === 'ALL' || entry.department === branchFilter;
            const sectionMatch = sectionFilter === 'ALL' || entry.section === sectionFilter;
            return branchMatch && sectionMatch;
        });
    };

    const FilterControls = () => (
        <div className="filter-system animate-fadeIn">
            <div className="filter-group">
                <label>Branch:</label>
                <div className="filter-pills">
                    {['ALL', 'CSE', 'CSM'].map(b => (
                        <button key={b} className={`pill ${branchFilter === b ? 'active' : ''}`} onClick={() => {
                            setBranchFilter(b);
                            setSectionFilter('ALL');
                        }}>{b}</button>
                    ))}
                </div>
            </div>
            {branchFilter !== 'ALL' && (
                <div className="filter-group animate-slideInRight">
                    <label>Section:</label>
                    <div className="filter-pills">
                        <button className={`pill ${sectionFilter === 'ALL' ? 'active' : ''}`} onClick={() => setSectionFilter('ALL')}>ALL</button>
                        {BRANCH_CONFIG[branchFilter].map(s => (
                            <button key={s} className={`pill ${sectionFilter === s ? 'active' : ''}`} onClick={() => setSectionFilter(s)}>{s}</button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    const handleStartQuiz = () => {
        socket.emit('quiz:start', { quizId });
        toast.success('Quiz Started!');
    };

    const handleNextAction = () => {
        socket.emit('quiz:next-question', { quizId });
    };

    const handleEndQuiz = () => {
        if (window.confirm("End quiz now?")) {
            socket.emit('quiz:end', { quizId });
        }
    };

    const handleRehostQuiz = async () => {
        if (!window.confirm("Host this quiz again? This will create a fresh session with a new PIN.")) return;
        try {
            const loadingToast = toast.loading('Creating new arena...');
            const response = await quizAPI.rehost(quizId);

            if (response.data.success) {
                console.log('✅ [REHOST] Success. New Quiz ID:', response.data.data.quizId);
                toast.dismiss(loadingToast);
                toast.success('New session created!');
                navigate(`/quiz/${response.data.data.quizId}/host`);
            } else {
                toast.dismiss(loadingToast);
                toast.error('Failed to create new session.');
            }
        } catch (error) {
            console.error('❌ [REHOST] API Error:', error);
            toast.dismiss();
            toast.error('Failed to re-host quiz.');
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
                            <div className={`status-indicator ${status}`}>{isScheduled ? 'Scheduled' : 'Waiting...'}</div>
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
                        <button className="btn btn-primary btn-xl" onClick={handleStartQuiz}>Start Quiz</button>
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
                        {status === 'active' && (
                            <div className="action-group">
                                <button className="btn btn-danger btn-sm" onClick={handleEndQuiz}>End</button>
                            </div>
                        )}
                        {status === 'completed' && (
                            <div className="action-group">
                                <button className="btn btn-secondary btn-sm" onClick={handleRehostQuiz}>Re-Host</button>
                                <button className="btn btn-primary btn-sm" onClick={() => navigate(`/quiz/${quizId}/results`)}>Report</button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="tab-content-area">

                    {activeTab === 'leaderboard' && (
                        <div className="leaderboard-view animate-fadeIn">
                            <div className="dashboard-head-section">
                                <h2 className="section-title">⚡ Live Dashboard</h2>
                                <div className="live-status-pills">
                                    <span className="live-count-pill"><FiUsers /> {getFilteredLeaderboard().length} Ranked</span>
                                </div>
                            </div>

                            <FilterControls />

                            <div className="attendance-table-container">
                                <table className="attendance-table">
                                    <thead>
                                        <tr>
                                            <th>Rank</th>
                                            <th>Student</th>
                                            <th>Branch/Sec</th>
                                            <th>Score</th>
                                            <th>Progress</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {getFilteredLeaderboard().map((entry, i) => (
                                            <tr key={entry._id || i} className="live-row">
                                                <td><span className="rank-display">#{leaderboard.findIndex(le => le.userId?._id === entry.userId?._id) + 1}</span></td>
                                                <td>
                                                    <div className="student-profile-info">
                                                        <span className="name-bold">{entry.userId?.name || entry.studentName}</span>
                                                        <span className="roll-mono">{entry.userId?.rollNumber || 'N/A'}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="dept-sec-info">
                                                        <span className="dept-tag">{entry.userId?.department || 'N/A'}</span>
                                                        <span className="sec-tag">{entry.userId?.section || 'N/A'}</span>
                                                    </div>
                                                </td>
                                                <td><span className="score-badge-live">{entry.totalScore} <span className="pts">pts</span></span></td>
                                                <td>{entry.answers?.filter(a => a.answer || a.answeredAt)?.length || 0} / {totalQuestions}</td>
                                            </tr>
                                        ))}
                                        {getFilteredLeaderboard().length === 0 && (
                                            <tr><td colSpan="5" className="no-data">No results matching filters.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'security' && (
                        <div className="security-view animate-fadeIn">
                            <h2 className="section-title">🛡️ Anti-Cheat Monitor</h2>
                            {cheatingAlerts.map((a, i) => (
                                <div key={i} className="alert-card">⚠️ {a.participantName}: {a.reason}</div>
                            ))}
                            {cheatingAlerts.length === 0 && <p className="no-alerts">No alerts detected.</p>}
                        </div>
                    )}

                    {activeTab === 'attendance' && (
                        <div className="attendance-view animate-fadeIn">
                            <div className="section-header-flex">
                                <h2 className="section-title">👥 Attendance Tracker</h2>
                                <div className="attendance-stats">
                                    <span className="stat-p"><FiCheck /> Present: {getFilteredAttendance().filter(a => a.status === 'Present').length}</span>
                                    <span className="stat-a"><FiStopCircle /> Absent: {getFilteredAttendance().filter(a => a.status === 'Absent').length}</span>
                                </div>
                            </div>

                            <FilterControls />
                            <div className="attendance-table-container">
                                <table className="attendance-table">
                                    <thead>
                                        <tr>
                                            <th>Roll Number</th>
                                            <th>Name</th>
                                            <th>Branch/Section</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {getFilteredAttendance().length > 0 ? (
                                            getFilteredAttendance().map((entry, i) => (
                                                <tr key={i} className={entry.status.toLowerCase()}>
                                                    <td><strong>{entry.rollNumber}</strong></td>
                                                    <td>{entry.name}</td>
                                                    <td>{entry.department} - {entry.section}</td>
                                                    <td>
                                                        <span className={`status-pill ${entry.status.toLowerCase()}`}>
                                                            {entry.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr><td colSpan="4" className="no-data">No students found matching current filters.</td></tr>
                                        )}
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
