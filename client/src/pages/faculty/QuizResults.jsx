import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    FiArrowLeft,
    FiDownload,
    FiUsers,
    FiClock,
    FiPercent,
    FiCheckCircle,
    FiXCircle,
    FiAlertTriangle,
    FiAward,
    FiBarChart2,
    FiChevronDown,
    FiChevronUp,
    FiUserMinus,
    FiFileText,
    FiCpu,
    FiTrendingUp,
    FiZap,
    FiCheck,
    FiStopCircle
} from 'react-icons/fi';
import { quizAPI, aiAPI } from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import FacultyLiveAnalysis from '../../components/faculty/FacultyLiveAnalysis';
import '../../components/faculty/FacultyLiveAnalysis.css';
import toast from 'react-hot-toast';
import './QuizResults.css';

const QuizResults = () => {
    const { quizId } = useParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [expandedStudent, setExpandedStudent] = useState(null);
    const [explainingQId, setExplainingQId] = useState(null);
    const [explanations, setExplanations] = useState({}); // { questionId: explanation }
    const [branchFilter, setBranchFilter] = useState('ALL');
    const [sectionFilter, setSectionFilter] = useState('ALL');
    const reportRef = useRef(null);
    const { socket } = useSocket();

    const BRANCH_CONFIG = {
        'CSE': ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
        'CSM': ['A', 'B', 'C', 'D', 'E']
    };

    useEffect(() => {
        fetchResults();
    }, [quizId]);

    const fetchResults = async () => {
        try {
            const response = await quizAPI.getResults(quizId);
            console.log('Quiz Results Data:', response.data.data); // Debug log
            setData(response.data.data);
        } catch (error) {
            console.error('Failed to fetch results:', error);
            toast.error('Failed to load quiz results');
            navigate('/dashboard');
        } finally {
            setLoading(false);
        }
    };

    // --- REAL-TIME UPDATES ---
    useEffect(() => {
        if (!socket || !quizId) return;

        socket.emit('quiz:join', { quizId }); // Specifically join for faculty status

        const handleNewResponse = (update) => {
            setData(prev => {
                if (!prev) return prev;
                const newResponses = [...prev.responses];
                const studentIdx = newResponses.findIndex(r => String(r.student?._id || r.userId) === String(update.participantId));

                if (studentIdx > -1) {
                    newResponses[studentIdx] = {
                        ...newResponses[studentIdx],
                        totalScore: update.score,
                        correctCount: update.isCorrect ? (newResponses[studentIdx].correctCount || 0) + 1 : (newResponses[studentIdx].correctCount || 0)
                    };
                }

                return {
                    ...prev,
                    responses: newResponses,
                    analytics: {
                        ...prev.analytics,
                        totalParticipants: newResponses.length
                    }
                };
            });
        };

        const handleParticipantJoin = (data) => {
            // Option to refresh or update live list
            console.log('New participant joined:', data.participant);
        };

        const handleLeaderboardUpdate = (lbData) => {
            setData(prev => {
                if (!prev) return prev;
                return { ...prev, leaderboard: lbData.leaderboard };
            });
        };

        socket.on('response:received', handleNewResponse);
        socket.on('participant:joined', handleParticipantJoin);
        socket.on('leaderboard:update', handleLeaderboardUpdate);

        return () => {
            socket.off('response:received', handleNewResponse);
            socket.off('participant:joined', handleParticipantJoin);
            socket.off('leaderboard:update', handleLeaderboardUpdate);
        };
    }, [socket, quizId]);

    const formatTime = (ms) => {
        if (!ms) return '0s';
        const seconds = Math.round(Math.abs(ms) / 1000);
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    };

    const downloadReport = async () => {
        try {
            const loadingToast = toast.loading('Generating Excel report...');
            const response = await quizAPI.downloadReport(quizId);

            // Create blob link to download
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;

            // Content-Disposition header check (optional, but good practice)
            const contentDisposition = response.headers['content-disposition'];
            let fileName = `Quiz_Report_${quizId}.xlsx`;
            if (contentDisposition) {
                const fileNameMatch = contentDisposition.match(/filename="?(.+)"?/);
                if (fileNameMatch && fileNameMatch.length === 2)
                    fileName = fileNameMatch[1];
            }

            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();

            toast.dismiss(loadingToast);
            toast.success('Report downloaded successfully!');
        } catch (error) {
            console.error('Download failed:', error);
            toast.dismiss();
            toast.error('Failed to download report. Please try again.');
        }
    };

    const handleAIExplain = async (q) => {
        const qId = q.questionId || q._id;
        if (explanations[qId]) return;

        try {
            setExplainingQId(qId);
            const response = await aiAPI.explainQuestion({
                question: q.text || q.questionText,
                userAnswer: "Provide a general academic review of this question.",
                correctAnswer: q.correctAnswer
            });

            setExplanations(prev => ({
                ...prev,
                [qId]: response.data.data.explanation
            }));
            toast.success('AI Review generated!');
        } catch (error) {
            console.error('AI Explanation Error:', error);
            toast.error('Failed to get AI review');
        } finally {
            setExplainingQId(null);
        }
    };

    const getFilteredLeaderboard = () => {
        if (!data || !data.leaderboard) return [];
        return data.leaderboard.filter(entry => {
            const s = entry.student || entry.userId || {};
            const branchMatch = branchFilter === 'ALL' || s.department === branchFilter;
            const sectionMatch = sectionFilter === 'ALL' || s.section === sectionFilter;
            return branchMatch && sectionMatch;
        });
    };

    const getFilteredResponses = () => {
        if (!data || !data.responses) return [];
        return data.responses.filter(entry => {
            const s = entry.student || entry.userId || {};
            const branchMatch = branchFilter === 'ALL' || s.department === branchFilter;
            const sectionMatch = sectionFilter === 'ALL' || s.section === sectionFilter;
            return branchMatch && sectionMatch;
        });
    };

    const FilterControls = () => (
        <div className="filter-system animate-slideInRight">
            <div className="filter-group">
                <label>Branch</label>
                <div className="filter-pills">
                    {['ALL', 'CSE', 'CSM'].map(b => (
                        <button
                            key={b}
                            className={`pill ${branchFilter === b ? 'active' : ''}`}
                            onClick={() => {
                                setBranchFilter(b);
                                setSectionFilter('ALL');
                            }}
                        >
                            {b}
                        </button>
                    ))}
                </div>
            </div>

            {branchFilter !== 'ALL' && (
                <div className="filter-group animate-slideInRight">
                    <label>Section</label>
                    <div className="filter-pills">
                        <button
                            className={`pill ${sectionFilter === 'ALL' ? 'active' : ''}`}
                            onClick={() => setSectionFilter('ALL')}
                        >
                            All Sections
                        </button>
                        {BRANCH_CONFIG[branchFilter].map(s => (
                            <button
                                key={s}
                                className={`pill ${sectionFilter === s ? 'active' : ''}`}
                                onClick={() => setSectionFilter(s)}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    if (loading) {
        return (
            <div className="results-page">
                <div className="loading-container">
                    <div className="spinner"></div>
                    <p>Loading results...</p>
                </div>
            </div>
        );
    }

    if (!data) return null;

    const { quiz, analytics, responses = [], questionAnalytics, leaderboard, absentStudents } = data;

    return (
        <div className="results-page">
            {/* Header */}
            <div className="results-header">
                <div className="header-left">
                    <button className="btn btn-ghost" onClick={() => navigate(-1)}>
                        <FiArrowLeft /> Back
                    </button>
                    <div className="header-info">
                        <h1>{quiz.title}</h1>
                        <p>Quiz Code: <strong>{quiz.code}</strong> • {quiz.totalQuestions} Questions • {quiz.totalPoints} Points</p>
                    </div>
                </div>
                <button className="btn btn-primary" onClick={downloadReport}>
                    <FiDownload /> Download Report
                </button>
            </div>

            {/* Tabs */}
            <div className="results-tabs">
                <button
                    className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
                    onClick={() => setActiveTab('overview')}
                >
                    <FiBarChart2 /> Overview ({analytics.totalParticipants})
                </button>
                <button
                    className={`tab ${activeTab === 'analytics' ? 'active' : ''}`}
                    onClick={() => setActiveTab('analytics')}
                >
                    <FiTrendingUp /> Analytics Report
                </button>
                <button
                    className={`tab ${activeTab === 'students' ? 'active' : ''}`}
                    onClick={() => setActiveTab('students')}
                >
                    <FiUsers /> Students
                </button>
                <button
                    className={`tab ${activeTab === 'questions' ? 'active' : ''}`}
                    onClick={() => setActiveTab('questions')}
                >
                    <FiFileText /> Questions
                </button>
                <button
                    className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`}
                    onClick={() => setActiveTab('dashboard')}
                >
                    <FiZap /> Live Dashboard
                </button>

                {absentStudents && absentStudents.length > 0 && (
                    <button
                        className={`tab ${activeTab === 'absent' ? 'active' : ''}`}
                        onClick={() => setActiveTab('absent')}
                    >
                        <FiUserMinus /> Absent ({absentStudents.length})
                    </button>
                )}
            </div>

            {/* Analytics Tab */}
            {activeTab === 'analytics' && (
                <div className="tab-content">
                    <FacultyLiveAnalysis
                        leaderboard={getFilteredLeaderboard()}
                        responses={getFilteredResponses()}
                        absentStudents={(data.absentStudents || []).filter(s => {
                            const branchMatch = branchFilter === 'ALL' || s.department === branchFilter;
                            const sectionMatch = sectionFilter === 'ALL' || s.section === sectionFilter;
                            return branchMatch && sectionMatch;
                        })}
                        totalQuestions={quiz.totalQuestions}
                        quiz={{ ...quiz, questions: data.questions || quiz.questions }}
                    />
                </div>
            )}

            {activeTab === 'overview' && (
                <div className="tab-content">
                    {/* Stats Grid */}
                    <div className="stats-grid">
                        <div className="stat-card">
                            <FiUsers className="stat-icon primary" />
                            <div className="stat-info">
                                <span className="stat-value">{analytics.totalParticipants}</span>
                                <span className="stat-label">Total Participants</span>
                            </div>
                        </div>
                        <div className="stat-card">
                            <FiCheckCircle className="stat-icon success" />
                            <div className="stat-info">
                                <span className="stat-value">{analytics.completedCount}</span>
                                <span className="stat-label">Completed</span>
                            </div>
                        </div>
                        <div className="stat-card">
                            <FiPercent className="stat-icon info" />
                            <div className="stat-info">
                                <span className="stat-value">{analytics.avgScore}%</span>
                                <span className="stat-label">Average Score</span>
                            </div>
                        </div>
                        <div className="stat-card">
                            <FiClock className="stat-icon accent" />
                            <div className="stat-info">
                                <span className="stat-value">{formatTime(analytics.avgTime)}</span>
                                <span className="stat-label">Avg. Time</span>
                            </div>
                        </div>
                        <div className="stat-card">
                            <FiTrendingUp className="stat-icon secondary" />
                            <div className="stat-info">
                                <span className="stat-value">{analytics.participationRate || 0}%</span>
                                <span className="stat-label">Participation Rate</span>
                            </div>
                        </div>
                    </div>

                    {/* Performance Highlights */}
                    <div className="performance-feedback-grid">
                        <div className="section-card">
                            <h3>Top Performers</h3>
                            <div className="performers-list">
                                {[...responses].sort((a, b) => b.percentage - a.percentage)
                                    .filter(r => r.percentage >= 75)
                                    .slice(0, 3)
                                    .map((r, i) => {
                                        const s = r.student || {};
                                        const getLabel = (p) => p >= 90 ? 'O - Outstanding' : 'Distinction';
                                        return (
                                            <div key={i} className="performer-item">
                                                <div className="perf-info">
                                                    <span className="perf-name">{s.name || 'Unknown'}</span>
                                                    <span className="perf-meta">
                                                        {s.rollNumber || 'N/A'} • {s.department || '-'}-{s.section || '-'}
                                                    </span>
                                                </div>
                                                <div className="perf-stats">
                                                    <span className="perf-val success">{r.percentage}%</span>
                                                    <span className="perf-lbl success">{getLabel(r.percentage)}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                {[...responses].filter(r => r.percentage >= 75).length === 0 && (
                                    <div className="empty-mini-alert">
                                        <p>No students scored above 75% in this attempt.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="section-card">
                            <h3>Needs Attention ({'<'} 60%)</h3>
                            <div className="performers-list">
                                {[...responses].sort((a, b) => a.percentage - b.percentage)
                                    .filter(r => r.percentage < 60)
                                    .slice(0, 5) // Show more for attention
                                    .map((r, i) => {
                                        const s = r.student || {};
                                        return (
                                            <div key={i} className="performer-item">
                                                <div className="perf-info">
                                                    <span className="perf-name">{s.name || 'Unknown'}</span>
                                                    <span className="perf-meta">
                                                        {s.rollNumber || 'N/A'} • {s.department || '-'}-{s.section || '-'}
                                                    </span>
                                                </div>
                                                <div className="perf-stats">
                                                    <span className="perf-val danger">{r.percentage}%</span>
                                                    <span className="perf-lbl danger">Review Needed</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                {[...responses].filter(r => r.percentage < 60).length === 0 && (
                                    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        <FiCheckCircle style={{ fontSize: '1.5rem', color: 'var(--success)', marginBottom: '0.5rem' }} />
                                        <p>All students are performing well above 60%</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Performance Overview */}
                    <div className="section-grid">
                        <div className="section-card">
                            <h3>Pass/Fail Distribution</h3>
                            <div className="distribution-chart">
                                <div className="dist-bar">
                                    <div
                                        className="dist-fill passed"
                                        style={{ width: `${analytics.passRate}%` }}
                                    ></div>
                                </div>
                                <div className="dist-legend">
                                    <span className="legend-item passed">
                                        <FiCheckCircle /> Passed: {analytics.passedCount} ({analytics.passRate}%)
                                    </span>
                                    <span className="legend-item failed">
                                        <FiXCircle /> Failed: {analytics.failedCount} ({100 - analytics.passRate}%)
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="section-card">
                            <h3>Score Range</h3>
                            <div className="score-range">
                                <div className="range-item">
                                    <span className="range-label">Highest</span>
                                    <span className="range-value high">{analytics.highestScore}%</span>
                                </div>
                                <div className="range-item">
                                    <span className="range-label">Average</span>
                                    <span className="range-value avg">{analytics.avgScore}%</span>
                                </div>
                                <div className="range-item">
                                    <span className="range-label">Lowest</span>
                                    <span className="range-value low">{analytics.lowestScore}%</span>
                                </div>
                            </div>
                        </div>

                        <div className="section-card">
                            <h3>Participation Status</h3>
                            <div className="status-list">
                                <div className="status-item">
                                    <span>Completed</span>
                                    <span className="status-count success">{analytics.completedCount}</span>
                                </div>
                                <div className="status-item">
                                    <span>In Progress</span>
                                    <span className="status-count warning">{analytics.inProgressCount}</span>
                                </div>
                                <div className="status-item">
                                    <span>Waiting</span>
                                    <span className="status-count info">{analytics.waitingCount}</span>
                                </div>
                                <div className="status-item">
                                    <span>Terminated</span>
                                    <span className="status-count danger">{analytics.terminatedCount}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Cheating Alerts */}
                    {analytics.tabSwitchersCount > 0 && (
                        <div className="section-card warning-card">
                            <h3><FiAlertTriangle /> Suspicious Activity ({analytics.tabSwitchersCount})</h3>
                            <div className="cheaters-list">
                                {analytics.tabSwitchers.map((s, i) => (
                                    <div key={i} className={`cheater-item ${s.terminated ? 'terminated' : ''}`}>
                                        <span className="cheater-name">{s.name}</span>
                                        <span className="cheater-email">{s.email}</span>
                                        <span className="cheater-count">{s.count} switches</span>
                                        {s.terminated && <span className="cheater-badge">TERMINATED</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Students Tab */}
            {activeTab === 'students' && (
                <div className="tab-content">
                    <div className="students-table-container leaderboard-table-container">
                        <table className="leaderboard-table">
                            <thead>
                                <tr>
                                    <th>Rank</th>
                                    <th>Student Details</th>
                                    <th>Branch/Section</th>
                                    <th>Score</th>
                                    <th>Time</th>
                                    <th>Status</th>
                                    <th>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {responses.map((r, idx) => {
                                    const s = r.student || {};
                                    return (
                                        <>
                                            <tr key={s.id || idx} className={r.passed ? 'passed' : 'failed'}>
                                                <td className="rank-col">
                                                    {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank || idx + 1}`}
                                                </td>
                                                <td className="student-col">
                                                    <div className="student-meta">
                                                        <span className="name">{s.name || 'Unknown User'}</span>
                                                        <span className="roll">{s.rollNumber || 'N/A'}</span>
                                                    </div>
                                                </td>
                                                <td className="branch-col">
                                                    <div className="branch-meta">
                                                        <span className="dept">{s.department || '-'}</span>
                                                        <span className="sec">Section {s.section || '-'}</span>
                                                    </div>
                                                </td>
                                                <td className="score-col">
                                                    <div className="score-meta">
                                                        <span className="marks">{r.percentage}%</span>
                                                        <span className="info-tag" style={{ fontSize: '0.7rem', padding: '2px 6px', marginTop: '4px' }}>
                                                            {r.totalScore}/{r.maxPossibleScore} pts
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="time-col">{formatTime(r.totalTimeTaken)}</td>
                                                <td>
                                                    <span className={`status-badge ${r.status}`}>
                                                        {r.status}
                                                        {(r.tabSwitchCount || 0) > 0 && <FiAlertTriangle title={`${r.tabSwitchCount} tab switches`} />}
                                                    </span>
                                                </td>
                                                <td>
                                                    <button
                                                        className="btn btn-sm btn-ghost"
                                                        onClick={() => setExpandedStudent(expandedStudent === s.id ? null : s.id)}
                                                        disabled={!s.id}
                                                    >
                                                        {expandedStudent === s.id ? <FiChevronUp /> : <FiChevronDown />}
                                                    </button>
                                                </td>
                                            </tr>
                                            {expandedStudent === s.id && (
                                                <tr className="expanded-row">
                                                    <td colSpan="8">
                                                        <div className="student-answers">
                                                            <h4>Answer Details for {s.name}</h4>
                                                            <div className="answers-grid">
                                                                {r.answers && r.answers.map((a, aIdx) => (
                                                                    <div key={aIdx} className={`answer-card ${a.isCorrect ? 'correct' : 'incorrect'}`}>
                                                                        <div className="answer-header">
                                                                            <span className="q-num">Q{aIdx + 1}</span>
                                                                            <span className={`answer-status ${a.isCorrect ? 'correct' : 'incorrect'}`}>
                                                                                {a.isCorrect ? <FiCheckCircle /> : <FiXCircle />}
                                                                                {a.pointsEarned}/{a.points || 0} pts
                                                                            </span>
                                                                        </div>
                                                                        <p className="q-text">{a.questionText}</p>
                                                                        <div className="answer-details">
                                                                            <div className={`answer-row ${a.isCorrect ? 'correct' : 'student'}`}>
                                                                                <span className="answer-label">Student's Answer:</span>
                                                                                <span className="answer-value">{a.studentAnswer || '(No answer)'}</span>
                                                                            </div>
                                                                            {!a.isCorrect && (
                                                                                <div className="answer-row correct">
                                                                                    <span className="answer-label">Correct Answer:</span>
                                                                                    <span className="answer-value">{a.correctAnswer}</span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <div className="answer-time">
                                                                            <FiClock /> {formatTime(a.timeTaken)}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Questions Tab */}
            {activeTab === 'questions' && (
                <div className="tab-content">
                    <div className="questions-analysis">
                        {questionAnalytics.map((q, idx) => (
                            <div key={q.questionId} className="question-card">
                                <div className="question-header">
                                    <span className="q-number">Q{q.questionNumber}</span>
                                    <span className={`difficulty ${q.difficulty}`}>{q.difficulty}</span>
                                    <span className="points">{q.points} pts</span>
                                </div>
                                <p className="question-text">{q.text || q.questionText}</p>
                                <div className="question-meta">
                                    <div className="meta-item">
                                        <span className="meta-label">Correct Answer</span>
                                        <span className="meta-value correct">{q.correctAnswer}</span>
                                    </div>
                                    {q.options && q.options.length > 0 && (
                                        <div className="meta-item options">
                                            <span className="meta-label">Options</span>
                                            <div className="options-list">
                                                {q.options.map((opt, i) => (
                                                    <span key={i} className={`option ${opt === q.correctAnswer ? 'correct' : ''}`}>
                                                        {String.fromCharCode(65 + i)}. {opt}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="accuracy-bar">
                                    <div className="accuracy-label">
                                        Accuracy: <strong>{q.accuracy}%</strong> ({q.correctAttempts}/{q.attempts} correct)
                                    </div>
                                    <div className="bar">
                                        <div className="fill" style={{ width: `${q.accuracy}%` }}></div>
                                    </div>
                                </div>

                                <div className="ai-review-section" style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                                    {explanations[q.questionId || q._id] ? (
                                        <div className="ai-explanation-box" style={{ background: 'var(--bg-tertiary)', padding: '15px', borderRadius: '10px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '8px' }}>
                                                <FiCpu /> AI ANALYSIS
                                            </div>
                                            <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>{explanations[q.questionId || q._id]}</p>
                                        </div>
                                    ) : (
                                        <button
                                            className="btn btn-sm btn-ghost"
                                            style={{ color: 'var(--primary)', fontWeight: '600' }}
                                            disabled={explainingQId === (q.questionId || q._id)}
                                            onClick={() => handleAIExplain(q)}
                                        >
                                            {explainingQId === (q.questionId || q._id) ? 'Analyzing...' : <><FiCpu style={{ marginRight: '5px' }} /> AI Review</>}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}



            {/* Live Dashboard Tab (Enhanced Metrics) */}
            {activeTab === 'dashboard' && (
                <div className="tab-content live-dashboard-view">
                    <div className="dashboard-head-section">
                        <h2 className="section-title">⚡ Detailed Performance Board</h2>
                        <div className="live-status-pills">
                            <span className="live-count-pill"><FiUsers /> {getFilteredResponses().length} Results</span>
                            <span className="live-count-pill success"><FiCheckCircle /> {getFilteredResponses().filter(r => r.status === 'completed').length} Completed</span>
                        </div>
                    </div>

                    <FilterControls />

                    <div className="attendance-table-container leaderboard-table-scroll live-dashboard-table">
                        <table className="attendance-table leaderboard-styled-table">
                            <thead>
                                <tr>
                                    <th>RANK</th>
                                    <th>STUDENT</th>
                                    <th>BRANCH / SEC</th>
                                    <th>TIMING</th>
                                    <th>TIME TAKEN</th>
                                    <th>PROGRESS</th>
                                    <th>PERFORMANCE</th>
                                    <th style={{ textAlign: 'right' }}>SCORE</th>
                                </tr>
                            </thead>
                            <tbody>
                                {getFilteredResponses().sort((a, b) => (b.totalScore - a.totalScore) || (a.totalTimeTaken - b.totalTimeTaken)).map((r, i) => {
                                    const s = r.student || r.userId || {};

                                    // Use leaderboard as source of truth for rank
                                    let rank = 0;
                                    if (data.leaderboard) {
                                        rank = data.leaderboard.findIndex(le =>
                                            String(le.student?._id || le.userId?._id || le.student?.id || le.userId?.id) === String(s._id || s.id)
                                        ) + 1;
                                    }

                                    // Fallback to sorting if not in leaderboard yet
                                    if (!rank || rank === 0) {
                                        const sorted = [...responses].sort((a, b) => b.totalScore - a.totalScore || a.totalTimeTaken - b.totalTimeTaken);
                                        rank = sorted.findIndex(res => String(res.student?._id || res.userId) === String(s._id || s.id)) + 1;
                                    }

                                    const totalQs = quiz.totalQuestions || 1;
                                    const attempted = r.answers?.filter(a => a.answer || a.studentAnswer)?.length || 0;
                                    const accuracy = attempted > 0 ? Math.round((r.correctCount / attempted) * 100) : 0;
                                    const avgSpeed = r.averageTimePerQuestion ? (r.averageTimePerQuestion / 1000).toFixed(1) : '0';

                                    const joinTime = r.startedAt ? new Date(r.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '---';
                                    const endTime = r.completedAt ? new Date(r.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) :
                                        (r.status === 'terminated' ? 'Terminated' : 'In Progress');

                                    return (
                                        <tr key={r._id || i} className={`live-row ${rank <= 3 && rank > 0 ? `rank-${rank}-row` : ''}`}>
                                            <td>
                                                <div className="rank-display">
                                                    {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank > 0 ? `#${rank}` : '---'}
                                                </div>
                                            </td>
                                            <td>
                                                <div className="student-profile-info">
                                                    <span className="name-bold">{s.name || 'Anonymous'}</span>
                                                    <span className="roll-mono">{s.rollNumber || 'N/A'}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="dept-sec-info">
                                                    <span className="dept-tag">{s.department || '-'}</span>
                                                    <span className="sec-tag">Section {s.section || '-'}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="timing-info">
                                                    <div className="time-item"><FiClock /> {joinTime} <span className="lbl">Joined</span></div>
                                                    <div className="time-item"><FiStopCircle /> {endTime} <span className="lbl">Ended</span></div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="duration-info">
                                                    <span className="duration-val">{formatTime(r.totalTimeTaken || 0)}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="progress-metrics">
                                                    <div className="progress-mini-bar" style={{ width: '100px' }}>
                                                        <div className="bar-fill" style={{ width: `${(attempted / totalQs) * 100}%` }}></div>
                                                    </div>
                                                    <span className="progress-txt">{attempted}/{totalQs} Questions</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="live-stats-metrics">
                                                    <div className="stat-pill accuracy">
                                                        <FiCheckCircle /> {accuracy}%
                                                    </div>
                                                    <div className="stat-pill speed">
                                                        <FiZap /> {avgSpeed}s
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className="score-badge-live">
                                                    {r.totalScore} <span className="pts">pts</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Absent Tab */}
            {activeTab === 'absent' && absentStudents && (
                <div className="tab-content">
                    <div className="leaderboard-table-container">
                        <div className="section-card danger" style={{ margin: '20px', border: 'none', background: 'rgba(226, 27, 60, 0.05)' }}>
                            <h3 style={{ color: 'var(--danger)', marginBottom: '5px' }}><FiUserMinus /> Absent Students</h3>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>These students were eligible but did not attempt the quiz.</p>
                        </div>
                        <table className="leaderboard-table">
                            <thead>
                                <tr>
                                    <th>Student Details</th>
                                    <th>Branch/Section</th>
                                    <th>Roll Number</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {absentStudents.map((s, idx) => (
                                    <tr key={s.id || idx} className="failed">
                                        <td className="student-col">
                                            <div className="student-meta">
                                                <span className="name">{s.name}</span>
                                                <span className="roll" style={{ opacity: 0.7 }}>{s.email}</span>
                                            </div>
                                        </td>
                                        <td className="branch-col">
                                            <div className="branch-meta">
                                                <span className="dept">{s.department} - Section {s.section}</span>
                                            </div>
                                        </td>
                                        <td><span className="roll">{s.rollNumber}</span></td>
                                        <td>
                                            <span className="status-badge terminated">Absent</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default QuizResults;
