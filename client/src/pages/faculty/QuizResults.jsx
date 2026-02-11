import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
    FiUser,
    FiMail,
    FiFileText
} from 'react-icons/fi';
import { quizAPI } from '../../services/api';
import toast from 'react-hot-toast';
import './QuizResults.css';

const QuizResults = () => {
    const { quizId } = useParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [expandedStudent, setExpandedStudent] = useState(null);
    const reportRef = useRef(null);

    useEffect(() => {
        fetchResults();
    }, [quizId]);

    const fetchResults = async () => {
        try {
            const response = await quizAPI.getResults(quizId);
            setData(response.data.data);
        } catch (error) {
            console.error('Failed to fetch results:', error);
            toast.error('Failed to load quiz results');
            navigate('/dashboard');
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (ms) => {
        if (!ms) return '0s';
        const seconds = Math.round(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    };

    const formatDate = (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const downloadReport = () => {
        if (!data) return;

        const { quiz, analytics, responses, questionAnalytics } = data;

        // Create CSV content
        let csv = `Quiz Report: ${quiz.title}\n`;
        csv += `Generated: ${new Date().toLocaleString()}\n\n`;

        // Quiz Info
        csv += `QUIZ INFORMATION\n`;
        csv += `Title,${quiz.title}\n`;
        csv += `Code,${quiz.code}\n`;
        csv += `Created By,${quiz.createdBy}\n`;
        csv += `Status,${quiz.status}\n`;
        csv += `Total Questions,${quiz.totalQuestions}\n`;
        csv += `Total Points,${quiz.totalPoints}\n`;
        csv += `Passing Score,${quiz.passingScore}%\n\n`;

        // Analytics
        csv += `ANALYTICS SUMMARY\n`;
        csv += `Total Participants,${analytics.totalParticipants}\n`;
        csv += `Completed,${analytics.completedCount}\n`;
        csv += `Average Score,${analytics.avgScore}%\n`;
        csv += `Average Time,${formatTime(analytics.avgTime)}\n`;
        csv += `Pass Rate,${analytics.passRate}%\n`;
        csv += `Highest Score,${analytics.highestScore}%\n`;
        csv += `Lowest Score,${analytics.lowestScore}%\n`;
        csv += `Tab Switchers,${analytics.tabSwitchersCount}\n\n`;

        // Student Results
        csv += `STUDENT RESULTS\n`;
        csv += `Rank,Name,Email,Score,Percentage,Correct,Wrong,Unanswered,Time Taken,Status,Passed,Tab Switches\n`;
        responses.forEach(r => {
            csv += `${r.rank || '-'},${r.student.name},${r.student.email},${r.totalScore}/${r.maxPossibleScore},${r.percentage}%,${r.correctCount},${r.wrongCount},${r.unansweredCount},${formatTime(r.totalTimeTaken)},${r.status},${r.passed ? 'Yes' : 'No'},${r.tabSwitchCount}\n`;
        });

        csv += `\nQUESTION ANALYSIS\n`;
        csv += `Q#,Question,Correct Answer,Attempts,Correct Attempts,Accuracy\n`;
        questionAnalytics.forEach(q => {
            csv += `${q.questionNumber},"${q.questionText.replace(/"/g, '""')}","${q.correctAnswer}",${q.totalAttempts},${q.correctAttempts},${q.accuracy}%\n`;
        });

        // Download
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Quiz_Report_${quiz.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        toast.success('Report downloaded!');
    };

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

    const { quiz, analytics, responses, questionAnalytics, leaderboard } = data;

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
                    <FiBarChart2 /> Overview
                </button>
                <button
                    className={`tab ${activeTab === 'students' ? 'active' : ''}`}
                    onClick={() => setActiveTab('students')}
                >
                    <FiUsers /> Students ({analytics.totalParticipants})
                </button>
                <button
                    className={`tab ${activeTab === 'questions' ? 'active' : ''}`}
                    onClick={() => setActiveTab('questions')}
                >
                    <FiFileText /> Questions ({quiz.totalQuestions})
                </button>
                <button
                    className={`tab ${activeTab === 'leaderboard' ? 'active' : ''}`}
                    onClick={() => setActiveTab('leaderboard')}
                >
                    <FiAward /> Leaderboard
                </button>
            </div>

            {/* Overview Tab */}
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
                    </div>

                    {/* Performance Feedback */}
                    <div className="section-grid" style={{ marginBottom: '1.5rem', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                        <div className="section-card">
                            <h3>Top Performers</h3>
                            <div className="performers-list">
                                {[...responses].sort((a, b) => b.percentage - a.percentage).slice(0, 3).map((r, i) => (
                                    <div key={i} className="performer-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontWeight: '500' }}>{r.student.name}</span>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{r.student.email}</span>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{ fontWeight: 'bold', color: 'var(--success)', display: 'block' }}>{r.percentage}%</span>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>Distinction</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="section-card">
                            <h3>Needs Attention</h3>
                            <div className="performers-list">
                                {[...responses].sort((a, b) => a.percentage - b.percentage).slice(0, 3).filter(r => r.percentage < 60).map((r, i) => (
                                    <div key={i} className="performer-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontWeight: '500' }}>{r.student.name}</span>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{r.student.email}</span>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{ fontWeight: 'bold', color: 'var(--danger)', display: 'block' }}>{r.percentage}%</span>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>Review Needed</span>
                                        </div>
                                    </div>
                                ))}
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
                    <div className="students-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Rank</th>
                                    <th>Student</th>
                                    <th>Score</th>
                                    <th>Correct</th>
                                    <th>Wrong</th>
                                    <th>Time</th>
                                    <th>Status</th>
                                    <th>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {responses.map((r, idx) => (
                                    <>
                                        <tr key={r.student.id} className={r.passed ? 'passed' : 'failed'}>
                                            <td className="rank-cell">
                                                {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank || idx + 1}`}
                                            </td>
                                            <td className="student-cell">
                                                <div className="student-info">
                                                    <span className="student-name">{r.student.name}</span>
                                                    <span className="student-email">{r.student.email}</span>
                                                </div>
                                            </td>
                                            <td className="score-cell">
                                                <strong>{r.percentage}%</strong>
                                                <span className="score-detail">{r.totalScore}/{r.maxPossibleScore}</span>
                                            </td>
                                            <td className="correct">{r.correctCount}</td>
                                            <td className="wrong">{r.wrongCount}</td>
                                            <td>{formatTime(r.totalTimeTaken)}</td>
                                            <td>
                                                <span className={`status-badge ${r.status}`}>
                                                    {r.status}
                                                    {r.tabSwitchCount > 0 && <FiAlertTriangle title={`${r.tabSwitchCount} tab switches`} />}
                                                </span>
                                            </td>
                                            <td>
                                                <button
                                                    className="btn btn-sm btn-ghost"
                                                    onClick={() => setExpandedStudent(expandedStudent === r.student.id ? null : r.student.id)}
                                                >
                                                    {expandedStudent === r.student.id ? <FiChevronUp /> : <FiChevronDown />}
                                                </button>
                                            </td>
                                        </tr>
                                        {expandedStudent === r.student.id && (
                                            <tr className="expanded-row">
                                                <td colSpan="8">
                                                    <div className="student-answers">
                                                        <h4>Answer Details for {r.student.name}</h4>
                                                        <div className="answers-grid">
                                                            {r.answers.map((a, aIdx) => (
                                                                <div key={aIdx} className={`answer-card ${a.isCorrect ? 'correct' : 'incorrect'}`}>
                                                                    <div className="answer-header">
                                                                        <span className="q-num">Q{aIdx + 1}</span>
                                                                        <span className={`answer-status ${a.isCorrect ? 'correct' : 'incorrect'}`}>
                                                                            {a.isCorrect ? <FiCheckCircle /> : <FiXCircle />}
                                                                            {a.pointsEarned}/{a.maxPoints} pts
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
                                ))}
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
                                <p className="question-text">{q.questionText}</p>
                                <div className="question-meta">
                                    <div className="meta-item">
                                        <span className="meta-label">Correct Answer</span>
                                        <span className="meta-value correct">{q.correctAnswer}</span>
                                    </div>
                                    {q.options.length > 0 && (
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
                                        Accuracy: <strong>{q.accuracy}%</strong> ({q.correctAttempts}/{q.totalAttempts} correct)
                                    </div>
                                    <div className="bar">
                                        <div className="fill" style={{ width: `${q.accuracy}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Leaderboard Tab */}
            {activeTab === 'leaderboard' && (
                <div className="tab-content">
                    <div className="leaderboard">
                        {/* Podium */}
                        <div className="podium">
                            {leaderboard.slice(0, 3).map((r, idx) => (
                                <div key={r.student.id} className={`podium-item rank-${idx + 1}`}>
                                    <div className="podium-medal">
                                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                                    </div>
                                    <div className="podium-name">{r.student.name}</div>
                                    <div className="podium-score">{r.percentage}%</div>
                                    <div className="podium-points">{r.totalScore} pts</div>
                                </div>
                            ))}
                        </div>

                        {/* Full List */}
                        <div className="leaderboard-list">
                            {leaderboard.map((r, idx) => (
                                <div key={r.student.id} className={`lb-item ${idx < 3 ? 'top' : ''}`}>
                                    <span className="lb-rank">
                                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                                    </span>
                                    <div className="lb-student">
                                        <span className="lb-name">{r.student.name}</span>
                                        <span className="lb-email">{r.student.email}</span>
                                    </div>
                                    <div className="lb-stats">
                                        <span className="lb-score">{r.percentage}%</span>
                                        <span className="lb-time">{formatTime(r.totalTimeTaken)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default QuizResults;
