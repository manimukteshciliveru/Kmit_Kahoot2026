import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { responseAPI, quizAPI } from '../../services/api';
import {
    FiAward, FiDownload, FiTrendingUp, FiActivity,
    FiUser, FiBook, FiCheckCircle, FiXCircle, FiArrowLeft, FiClock,
    FiTarget, FiLayers, FiBarChart2, FiPieChart, FiAlertCircle
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import KmitLogo from '../../components/common/KmitLogo';
import '../common/Profile.css';

const QuizReport = () => {
    const { responseId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [report, setReport] = useState(null);
    const [leaderboard, setLeaderboard] = useState([]);
    const [loading, setLoading] = useState(true);
    const [analytics, setAnalytics] = useState(null);
    const [showAllLeaderboard, setShowAllLeaderboard] = useState(false);
    const [participationStats, setParticipationStats] = useState(null);

    useEffect(() => {
        fetchReportData();
    }, [responseId]);

    const fetchReportData = async () => {
        setLoading(true);
        try {
            const res = await responseAPI.getById(responseId);
            const reportData = res.data.data.response;
            const stats = res.data.data.stats;

            if (!reportData) throw new Error('Report data is empty');

            setReport(reportData);
            setParticipationStats(stats);

            // Fetch leaderboard for stats
            if (reportData.quizId?._id) {
                const lbRes = await quizAPI.getLeaderboard(reportData.quizId._id);
                const lbData = lbRes.data.data.leaderboard || [];
                setLeaderboard(lbData);
                generateAnalytics(reportData, lbData);
            }
        } catch (error) {
            console.error('Error fetching report:', error);
            const message = error.response?.data?.message || 'Failed to load report data';
            toast.error(message);
            if (error.response?.status === 403 || error.response?.status === 404) {
                navigate('/history');
            }
        } finally {
            setLoading(false);
        }
    };

    const generateAnalytics = (data, lbData) => {
        const totalQ = data.quizId.questions.length;
        const attempted = data.answers.filter(a => a.answer).length;
        const correct = data.answers.filter(a => a.isCorrect).length;
        const incorrect = attempted - correct;

        // Calculate Percentile
        const myScore = data.totalScore;
        const scoresBelow = lbData.filter(p => p.totalScore < myScore).length;
        const percentile = lbData.length > 1 ? ((scoresBelow / (lbData.length - 1)) * 100).toFixed(1) : 100;

        // Time usage (Student)
        const myTotalTime = data.totalTimeTaken || 0;
        const avgTimePerQ = myTotalTime / (attempted || 1);

        // Time usage (Class Average)
        // Check if leaderboard entires have totalTimeTaken, otherwise default
        const classTotalTime = lbData.reduce((acc, curr) => acc + (curr.totalTimeTaken || 0), 0);
        const classAvgTimePerQuiz = classTotalTime / (lbData.length || 1);
        const classAvgTimePerQ = classAvgTimePerQuiz / (totalQ || 1);

        setAnalytics({
            totalQuestions: totalQ,
            attempted,
            unattempted: totalQ - attempted,
            correct,
            incorrect,
            accuracy: attempted > 0 ? ((correct / attempted) * 100).toFixed(1) : 0,
            avgTime: (avgTimePerQ / 1000).toFixed(1),
            classAvgTime: (classAvgTimePerQ / 1000).toFixed(1),
            percentile,
            rank: data.rank || '-',
            classAvgScore: (lbData.reduce((acc, curr) => acc + curr.totalScore, 0) / (lbData.length || 1)).toFixed(1),
            performanceCategory: getPerformanceCategory(data.percentage)
        });
    };

    const getPerformanceCategory = (percentage) => {
        if (percentage >= 85) return { label: 'Excellent', color: 'success' };
        if (percentage >= 70) return { label: 'Good', color: 'primary' };
        if (percentage >= 50) return { label: 'Average', color: 'warning' };
        return { label: 'Needs Improvement', color: 'danger' };
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const downloadCSV = () => {
        if (!report) return;
        const quizTitle = report.quizId?.title || 'Quiz_Report';

        // 1. Report Card Header
        const reportHeaders = ['QUIZ PERFORMANCE REPORT'];
        const quizInfo = [
            ['Quiz Title', report.quizId?.title],
            ['Quiz Code', report.quizId?.code],
            ['Faculty', report.quizId?.createdBy?.name],
            ['Student Name', user.name],
            ['Roll Number', user.rollNumber],
            ['Rank', `#${analytics.rank}`],
            ['Total Score', `${report.totalScore}/${report.maxPossibleScore}`],
            ['Percentage', `${report.percentage}%`],
            ['Date', formatDate(report.quizId?.startedAt)],
            []
        ];

        // 2. Question-wise Details
        const questionHeaders = ['Q.No', 'Question', 'Topic', 'Your Answer', 'Correct Answer', 'Status', 'Marks', 'Time (s)'];
        const questionRows = report.answers.map((a, idx) => {
            const qDetail = report.quizId?.questions?.find(q => q._id === a.questionId);
            return [
                idx + 1,
                `"${(qDetail?.text || 'N/A').replace(/"/g, '""')}"`,
                `"${(qDetail?.topic || 'General').replace(/"/g, '""')}"`,
                `"${(a.answer || 'Skipped').replace(/"/g, '""')}"`,
                `"${(qDetail?.correctAnswer || 'N/A').replace(/"/g, '""')}"`,
                a.isCorrect ? 'Correct' : 'Incorrect',
                a.pointsEarned,
                (a.timeTaken / 1000).toFixed(1)
            ];
        });

        // 3. Final Leaderboard
        const leaderboardHeader = [[], ['FINAL LEADERBOARD']];
        const leaderboardCols = ['Rank', 'Student Name', 'Total Score', 'Status'];
        const leaderboardRows = leaderboard.map(lb => [
            lb.rank || '-',
            lb.userId.name,
            lb.totalScore,
            lb.status
        ]);

        const csvContent = [
            ...quizInfo,
            ['DETAILED ANALYSIS'],
            questionHeaders,
            ...questionRows,
            ...leaderboardHeader,
            leaderboardCols,
            ...leaderboardRows
        ].map(e => e.join(",")).join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `ReportCard_${quizTitle.replace(/\s+/g, '_')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading || !report || !analytics) {
        return (
            <div className="report-loading-wrapper">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="report-container">
            {/* 1. Header Section */}
            <header className="report-header">
                <div className="header-top">
                    <div className="institute-branding">
                        <KmitLogo height="50px" />
                        <div className="institute-info">
                            <h2>Keshav Memorial Institute of Technology</h2>
                            <p>Quiz Performance Report</p>
                        </div>
                    </div>
                    <div className="report-meta">
                        <span className="gen-date">Generated: {new Date().toLocaleDateString()}</span>
                        <button className="btn-print" onClick={downloadCSV}>
                            <FiDownload /> Download CSV
                        </button>
                    </div>
                </div>

                <div className="quiz-banner">
                    <div className="quiz-main-info">
                        <h1>{report.quizId?.title}</h1>
                        <p className="quiz-code">CODE: {report.quizId?.code}</p>
                    </div>
                    <div className="quiz-meta-grid">
                        <div className="meta-item">
                            <span className="label">Faculty</span>
                            <span className="value">{report.quizId?.createdBy?.name}</span>
                        </div>
                        <div className="meta-item">
                            <span className="label">Date</span>
                            <span className="value">{formatDate(report.quizId?.startedAt)}</span>
                        </div>
                        <div className="meta-item">
                            <span className="label">Duration</span>
                            <span className="value">{report.quizId?.duration} min</span>
                        </div>
                        <div className="meta-item">
                            <span className="label">Participants</span>
                            <span className="value">{leaderboard.length}</span>
                        </div>
                        {participationStats && (
                            <div className="meta-item">
                                <span className="label">Participation Rate</span>
                                <span className="value text-success">{participationStats.participationRate}%</span>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* 2. Student Profile Section */}
            <section className="student-profile-section">
                <div className="profile-card">
                    <div className="profile-left">
                        <div className="avatar-circle">{user.name[0]}</div>
                        <div className="student-details">
                            <h3>{user.name}</h3>
                            <p>{user.rollNumber} | {user.department} - {user.section}</p>
                        </div>
                    </div>
                    <div className="profile-stats">
                        <div className="stat-box highlight">
                            <span className="s-label">Rank</span>
                            <span className="s-value">#{analytics.rank}</span>
                        </div>
                        <div className="stat-box">
                            <span className="s-label">Percentile</span>
                            <span className="s-value">{analytics.percentile}%</span>
                        </div>
                        <div className="stat-box">
                            <span className="s-label">Score</span>
                            <span className="s-value text-primary">{report.totalScore}/{report.maxPossibleScore}</span>
                        </div>
                        <div className="stat-box">
                            <span className="s-label">Percentage</span>
                            <span className="s-value">{report.percentage}%</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* 3. Performance Dashboard */}
            <section className="dashboard-grid">
                <div className="dashboard-card summary-box">
                    <h3><FiActivity /> Performance Summary</h3>
                    <div className="metrics-grid-compact">
                        <div className="m-item">
                            <span className="m-val">{analytics.totalQuestions}</span>
                            <span className="m-lbl">Questions</span>
                        </div>
                        <div className="m-item">
                            <span className="m-val text-success">{analytics.correct}</span>
                            <span className="m-lbl">Correct</span>
                        </div>
                        <div className="m-item">
                            <span className="m-val text-danger">{analytics.incorrect}</span>
                            <span className="m-lbl">Incorrect</span>
                        </div>
                        <div className="m-item">
                            <span className="m-val text-warning">{analytics.unattempted}</span>
                            <span className="m-lbl">Skipped</span>
                        </div>
                    </div>
                </div>

                <div className="dashboard-card insights-box">
                    <h3><FiTrendingUp /> Analytical Insights</h3>
                    <div className="insights-list">
                        <div className="insight-row">
                            <span className="i-label">Accuracy Rate</span>
                            <div className="progress-bar-wrapper">
                                <div className="progress-fill" style={{ width: `${analytics.accuracy}%`, background: 'var(--primary)' }}></div>
                            </div>
                            <span className="i-val">{analytics.accuracy}%</span>
                        </div>
                        <div className="insight-row">
                            <span className="i-label">Avg Time/Q</span>
                            <span className="i-val-text">{analytics.avgTime}s <small>(Class: {analytics.classAvgTime}s)</small></span>
                        </div>
                        <div className="insight-row">
                            <span className="i-label">Class Average</span>
                            <span className="i-val-text">{analytics.classAvgScore} Marks</span>
                        </div>
                        <div className={`performance-badge ${analytics.performanceCategory.color}`}>
                            {analytics.performanceCategory.label} Performance
                        </div>
                    </div>
                </div>
            </section>

            {/* 4. Detailed Question Analysis */}
            <section className="detailed-analysis">
                <div className="section-head">
                    <h3><FiLayers /> Question-wise Analysis</h3>
                </div>
                <div className="table-responsive">
                    <table className="analysis-table">
                        <thead>
                            <tr>
                                <th>Q.No</th>
                                <th>Topic</th>
                                <th>Question</th>
                                <th>Difficulty</th>
                                <th>Your Answer</th>
                                <th>Correct Ans</th>
                                <th>Status</th>
                                <th>Marks</th>
                                <th>Time(s)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.answers.map((ans, idx) => {
                                const q = report.quizId.questions.find(q => q._id === ans.questionId);
                                return (
                                    <tr key={idx} className={ans.isCorrect ? 'row-correct' : 'row-incorrect'}>
                                        <td className="text-center">{idx + 1}</td>
                                        <td className="text-center font-mono">{q?.topic || 'General'}</td>
                                        <td className="q-cell" title={q?.text}>{q?.text?.substring(0, 60)}...</td>
                                        <td className="text-center">
                                            <span className={`diff-badge ${q?.difficulty || 'medium'}`}>
                                                {q?.difficulty || 'Medium'}
                                            </span>
                                        </td>
                                        <td className="ans-cell font-mono">{ans.answer || '-'}</td>
                                        <td className="ans-cell font-mono">{q?.correctAnswer}</td>
                                        <td className="text-center status-cell">
                                            {ans.isCorrect ? <FiCheckCircle className="text-success" /> : <FiXCircle className="text-danger" />}
                                        </td>
                                        <td className="text-center font-bold">{ans.pointsEarned}</td>
                                        <td className="text-center">{(ans.timeTaken / 1000).toFixed(1)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* 5. Full Leaderboard Section */}
            <section className="leaderboard-snapshot">
                <div className="section-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3><FiAward /> Quiz Leaderboard</h3>
                    <button
                        className="btn-text"
                        onClick={() => setShowAllLeaderboard(!showAllLeaderboard)}
                        style={{ color: 'var(--primary)', fontWeight: '600', cursor: 'pointer', background: 'none', border: 'none' }}
                    >
                        {showAllLeaderboard ? 'Show Top 5' : 'Show All Participants'}
                    </button>
                </div>

                <div className="leaderboard-table-wrapper professional-leaderboard">
                    <table className="analysis-table leaderboard-table">
                        <thead>
                            <tr>
                                <th className="rank-col">RANK</th>
                                <th className="student-col">STUDENT DETAILS</th>
                                <th className="branch-col">BRANCH/SECTION</th>
                                <th className="performance-col">PERFORMANCE</th>
                                <th className="time-col">TIME</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(showAllLeaderboard ? leaderboard : leaderboard.slice(0, 5)).map((lb, idx) => {
                                const s = lb.userId || {};
                                const currentRank = lb.rank || idx + 1;
                                const maxScore = report.quizId.questions.reduce((sum, q) => sum + (q.points || 0), 0) || 75; // Fallback to 75 as seen in image
                                const performancePercent = Math.round((lb.totalScore / maxScore) * 100);

                                return (
                                    <tr key={idx} className={user._id === s._id ? 'row-highlight' : ''}>
                                        <td className="rank-col">
                                            <div className="rank-badge-container">
                                                {currentRank === 1 ? <span className="rank-emoji">🥇</span> :
                                                    currentRank === 2 ? <span className="rank-emoji">🥈</span> :
                                                        currentRank === 3 ? <span className="rank-emoji">🥉</span> :
                                                            <span className="rank-number">#{currentRank}</span>}
                                            </div>
                                        </td>
                                        <td className="student-col">
                                            <div className="student-meta">
                                                <span className="name">{s.name}</span>
                                                <span className="roll">{s.rollNumber || 'N/A'}</span>
                                            </div>
                                        </td>
                                        <td className="branch-col">
                                            <div className="branch-meta">
                                                <span className="dept">{s.department || 'CSE'}</span>
                                                <span className="sec">Section {s.section || 'E'}</span>
                                            </div>
                                        </td>
                                        <td className="performance-col">
                                            <div className="perf-meta">
                                                <span className="score-text">
                                                    <strong>{lb.totalScore}</strong>/{maxScore}
                                                </span>
                                                <div className="perf-progress-bar">
                                                    <div
                                                        className="perf-progress-fill"
                                                        style={{ width: `${performancePercent}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="time-col font-bold">
                                            {Math.round(lb.totalTimeTaken / 1000)}s
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            <div className="footer-actions">
                <button className="btn-back" onClick={() => navigate('/history')}>
                    <FiArrowLeft /> Back to Dashboard
                </button>
            </div>

            <style>{`
                .report-container {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 2rem;
                    background: var(--bg-body);
                    color: var(--text-primary);
                    font-family: 'Inter', sans-serif;
                }

                /* Header */
                .report-header {
                    background: white;
                    border-radius: 12px;
                    padding: 2rem;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                    margin-bottom: 2rem;
                    border-bottom: 4px solid var(--primary);
                }

                .header-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 1.5rem;
                    margin-bottom: 1.5rem;
                }

                .institute-branding {
                    display: flex;
                    align-items: center;
                    gap: 1.5rem;
                }

                .institute-info h2 {
                    margin: 0;
                    font-size: 1.4rem;
                    color: #1a1a1a;
                    font-weight: 800;
                }

                .institute-info p {
                    margin: 0;
                    color: #666;
                    font-size: 0.9rem;
                    letter-spacing: 1px;
                    text-transform: uppercase;
                }

                .btn-print {
                    background: var(--bg-secondary);
                    border: 1px solid #ddd;
                    padding: 0.6rem 1.2rem;
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .btn-print:hover { background: #eee; }

                .quiz-banner {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                }

                .quiz-main-info h1 {
                    font-size: 2.2rem;
                    margin: 0 0 0.5rem 0;
                    color: var(--primary);
                }

                .quiz-code {
                    background: #f0f0f0;
                    display: inline-block;
                    padding: 0.3rem 0.8rem;
                    border-radius: 4px;
                    font-weight: 700;
                    font-size: 0.8rem;
                    letter-spacing: 1px;
                }

                .quiz-meta-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 2rem;
                }

                .meta-item {
                    display: flex;
                    flex-direction: column;
                }

                .meta-item .label { font-size: 0.75rem; color: #888; text-transform: uppercase; }
                .meta-item .value { font-weight: 700; font-size: 1.1rem; }

                /* Student Profile */
                .student-profile-section {
                    background: white;
                    border-radius: 12px;
                    padding: 1.5rem 2rem;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                    margin-bottom: 2rem;
                    border-left: 5px solid var(--secondary);
                }

                .profile-card {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .profile-left {
                    display: flex;
                    align-items: center;
                    gap: 1.5rem;
                }

                .avatar-circle {
                    width: 60px;
                    height: 60px;
                    background: var(--primary);
                    color: white;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.5rem;
                    font-weight: bold;
                }

                .student-details h3 { margin: 0 0 0.3rem 0; font-size: 1.4rem; }
                .student-details p { margin: 0; color: #666; }

                .profile-stats {
                    display: flex;
                    gap: 2.5rem;
                }

                .stat-box {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }

                .s-label { font-size: 0.8rem; color: #888; text-transform: uppercase; margin-bottom: 0.3rem; }
                .s-value { font-size: 1.4rem; font-weight: 800; color: #333; }
                .stat-box.highlight .s-value { color: var(--primary); font-size: 1.8rem; }

                /* Dashboard */
                .dashboard-grid {
                    display: grid;
                    grid-template-columns: 1.5fr 1fr;
                    gap: 2rem;
                    margin-bottom: 2rem;
                }

                .dashboard-card {
                    background: white;
                    border-radius: 12px;
                    padding: 1.5rem;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                }

                .dashboard-card h3 {
                    display: flex;
                    align-items: center;
                    gap: 0.8rem;
                    margin-top: 0;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 1rem;
                    margin-bottom: 1.5rem;
                    font-size: 1.2rem;
                }

                .metrics-grid-compact {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 1rem;
                    text-align: center;
                }

                .m-item {
                    background: #f9fafb;
                    padding: 1rem;
                    border-radius: 8px;
                }

                .m-val { font-size: 1.8rem; font-weight: 800; display: block; }
                .m-lbl { font-size: 0.8rem; color: #666; }

                .insight-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.2rem;
                    font-size: 0.95rem;
                }

                .progress-bar-wrapper {
                    flex-grow: 1;
                    height: 8px;
                    background: #eee;
                    border-radius: 4px;
                    margin: 0 1rem;
                    overflow: hidden;
                }

                .progress-fill { height: 100%; border-radius: 4px; }

                .performance-badge {
                    text-align: center;
                    padding: 0.8rem;
                    border-radius: 8px;
                    font-weight: 700;
                    margin-top: 1.5rem;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .performance-badge.success { background: #dcfce7; color: #166534; }
                .performance-badge.primary { background: #dbeafe; color: #1e40af; }
                .performance-badge.warning { background: #fef9c3; color: #854d0e; }
                .performance-badge.danger { background: #fee2e2; color: #991b1b; }

                /* Detailed Table */
                .detailed-analysis {
                    background: white;
                    border-radius: 12px;
                    padding: 2rem;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                    margin-bottom: 2rem;
                }

                .analysis-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.9rem;
                }

                .analysis-table th {
                    text-align: left;
                    padding: 1rem;
                    border-bottom: 2px solid #eee;
                    color: #555;
                    font-weight: 700;
                    text-transform: uppercase;
                    font-size: 0.8rem;
                }

                .analysis-table td {
                    padding: 1rem;
                    border-bottom: 1px solid #f0f0f0;
                    vertical-align: middle;
                }

                .diff-badge {
                    padding: 0.2rem 0.6rem;
                    border-radius: 4px;
                    font-size: 0.7rem;
                    text-transform: uppercase;
                    font-weight: 600;
                }
                .diff-badge.easy { background: #dcfce7; color: #166534; }
                .diff-badge.medium { background: #fef9c3; color: #854d0e; }
                .diff-badge.hard { background: #fee2e2; color: #991b1b; }

                .font-mono { font-family: monospace; font-size: 0.95rem; }
                .text-center { text-align: center; }
                .text-success { color: var(--success); }
                .text-danger { color: var(--danger); }
                .text-warning { color: var(--warning); }
                .text-primary { color: var(--primary); }
                .font-bold { font-weight: 700; }

                /* Leaderboard Snapshot */
                .leaderboard-snapshot {
                    background: white;
                    border-radius: 12px;
                    padding: 2rem;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                    margin-bottom: 3rem;
                }

                /* Professional Leaderboard Table - Matching Faculty View */
                .professional-leaderboard {
                    margin-top: 1rem;
                    border: 1px solid #edf2f7;
                    border-radius: 12px;
                    overflow: hidden;
                    background: white;
                }

                .professional-leaderboard .analysis-table th {
                    background: #f8fafc;
                    color: #64748b;
                    font-size: 0.75rem;
                    letter-spacing: 0.05em;
                    padding: 1.25rem 1rem;
                    border-bottom: 1px solid #edf2f7;
                }

                .professional-leaderboard .analysis-table td {
                    padding: 1.25rem 1rem;
                    border-bottom: 1px solid #f1f5f9;
                }

                .rank-col { width: 100px; text-align: center; }
                .rank-badge-container { font-size: 1.25rem; font-weight: 800; }
                .rank-emoji { font-size: 1.5rem; }
                .rank-number { color: #1e293b; color: var(--text-primary); font-size: 1.1rem; }

                .student-col { min-width: 250px; }
                .student-meta { display: flex; flex-direction: column; gap: 2px; }
                .student-meta .name { font-weight: 700; color: #1e293b; font-size: 1rem; text-transform: uppercase; }
                .student-meta .roll { font-size: 0.75rem; color: #94a3b8; font-family: var(--font-mono); }

                .branch-col { min-width: 150px; }
                .branch-meta { display: flex; flex-direction: column; gap: 2px; }
                .branch-meta .dept { font-weight: 700; color: #2563eb; font-size: 0.9rem; }
                .branch-meta .sec { font-size: 0.8rem; color: #64748b; }

                .performance-col { min-width: 200px; }
                .perf-meta { display: flex; flex-direction: column; gap: 8px; }
                .score-text { font-size: 0.95rem; color: #1e293b; }
                .score-text strong { font-size: 1.1rem; }
                
                .perf-progress-bar {
                    height: 8px;
                    background: #f1f5f9;
                    border-radius: 4px;
                    overflow: hidden;
                    width: 140px;
                }
                .perf-progress-fill {
                    height: 100%;
                    background: #3b82f6;
                    border-radius: 4px;
                    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .time-col { width: 120px; text-align: right; color: #475569; padding-right: 2rem !important; }

                .row-highlight {
                    background: #f0f9ff !important;
                    border-left: 4px solid #3b82f6 !important;
                }

                .std-info { display: flex; flex-direction: column; }
                .std-name { font-weight: 600; font-size: 0.9rem; }
                .std-score { font-size: 0.8rem; color: #666; }

                .footer-actions { display: flex; justify-content: center; padding-bottom: 2rem; }

                .footer-actions { display: flex; justify-content: center; padding-bottom: 2rem; }
                .btn-back {
                    display: flex; align-items: center; gap: 0.5rem;
                    padding: 0.8rem 1.5rem;
                    background: transparent;
                    border: 1px solid var(--primary);
                    color: var(--primary);
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .btn-back:hover { background: var(--primary); color: white; }
                
                @media print {
                   .btn-print, .btn-back, .footer-actions { display: none; }
                   .report-container { box-shadow: none; margin: 0; padding: 0; max-width: 100%; border-left: none !important; }
                   body { background: white; }
                }

                @media (max-width: 768px) {
                    .quiz-banner { flex-direction: column; align-items: flex-start; gap: 1rem; }
                    .quiz-meta-grid { grid-template-columns: 1fr 1fr; width: 100%; }
                    .profile-card { flex-direction: column; align-items: flex-start; gap: 1.5rem; }
                    .profile-stats { width: 100%; justify-content: space-between; }
                    .dashboard-grid { grid-template-columns: 1fr; }
                    .metrics-grid-compact { grid-template-columns: repeat(2, 1fr); }
                }
            `}</style>
        </div>
    );
};

export default QuizReport;
