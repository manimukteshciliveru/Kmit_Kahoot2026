import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { responseAPI, quizAPI, aiAPI } from '../../services/api';
import {
    FiAward, FiDownload, FiTrendingUp, FiActivity,
    FiUser, FiBook, FiCheckCircle, FiXCircle, FiArrowLeft, FiClock,
    FiTarget, FiLayers, FiBarChart2, FiPieChart, FiAlertCircle, FiZap, FiInfo, FiCheck
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
    const [aiReview, setAIReview] = useState(null);
    const [reviewLoading, setReviewLoading] = useState(false);
    const [explainingQId, setExplainingQId] = useState(null);
    const [explanations, setExplanations] = useState({});
    const [branchFilter, setBranchFilter] = useState('ALL');
    const [sectionFilter, setSectionFilter] = useState('ALL');

    const BRANCH_CONFIG = {
        'CSE': ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
        'CSM': ['A', 'B', 'C', 'D', 'E']
    };

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

            // Fetch AI review first so it's not affected by leaderboard failures
            if (reportData.quizId?._id) {
                fetchAIReview(reportData.quizId._id);
            }

            // Decoupled Leaderboard Fetch (Privacy Safe)
            try {
                if (reportData.quizId?._id) {
                    const lbRes = await quizAPI.getLeaderboard(reportData.quizId._id);
                    const lbData = lbRes.data.data.leaderboard || [];
                    setLeaderboard(lbData);
                    generateAnalytics(reportData, lbData);
                }
            } catch (lbError) {
                console.warn('Leaderboard hidden or inaccessible:', lbError.message);
                // Fallback: Generate basic analytics without leaderboard comparison
                generateAnalytics(reportData, []);
            }

        } catch (error) {
            console.error('Error fetching report:', error);
            const message = error.response?.data?.message || 'Failed to load report data';
            toast.error(message);
            // Only redirect if the PRIMARY report data fetch failed with 403/404
            if (error.response?.status === 403 || error.response?.status === 404) {
                navigate('/history');
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchAIReview = async (quizId) => {
        setReviewLoading(true);
        try {
            const res = await aiAPI.getReview(quizId);
            if (res.data.success) {
                setAIReview(res.data.data.feedback);
            }
        } catch (error) {
            console.error('AI Review error:', error);
        } finally {
            setReviewLoading(false);
        }
    };

    const handleAIExplain = async (ans, q) => {
        const qId = q._id;
        if (explanations[qId]) return;

        try {
            setExplainingQId(qId);
            const response = await aiAPI.explainQuestion({
                question: q.text,
                userAnswer: ans.answer || "Skipped",
                correctAnswer: q.correctAnswer
            });

            setExplanations(prev => ({
                ...prev,
                [qId]: response.data.data.explanation
            }));
            toast.success('AI Analysis generated!');
        } catch (error) {
            console.error('AI Analysis Error:', error);
            toast.error('Failed to get AI Analysis');
        } finally {
            setExplainingQId(null);
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

    const getFilteredLeaderboard = () => {
        if (!leaderboard) return [];
        return leaderboard.filter(entry => {
            const s = entry.userId || {};
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
                            All
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
    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const downloadCSV = () => {
        if (!report) return;
        const quizTitle = report.quizId?.title || 'Quiz_Report';

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
        return <div className="report-loading-wrapper"><div className="spinner"></div></div>;
    }

    return (
        <div className="report-container">
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
                        <div className="meta-item"><span className="label">Faculty</span><span className="value">{report.quizId?.createdBy?.name}</span></div>
                        <div className="meta-item"><span className="label">Date</span><span className="value">{formatDate(report.quizId?.startedAt)}</span></div>
                        <div className="meta-item"><span className="label">Duration</span><span className="value">{report.quizId?.duration} min</span></div>
                        <div className="meta-item"><span className="label">Participants</span><span className="value">{leaderboard.length}</span></div>
                    </div>
                </div>
            </header>

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
                        <div className="stat-box highlight"><span className="s-label">Rank</span><span className="s-value">#{analytics.rank}</span></div>
                        <div className="stat-box"><span className="s-label">Percentile</span><span className="s-value">{analytics.percentile}%</span></div>
                        <div className="stat-box"><span className="s-label">Score</span><span className="s-value text-primary">{report.totalScore}/{report.maxPossibleScore}</span></div>
                        <div className="stat-box"><span className="s-label">Percentage</span><span className="s-value">{report.percentage}%</span></div>
                    </div>
                </div>
            </section>

            <section className="dashboard-grid">
                <div className="dashboard-card summary-box">
                    <h3><FiActivity /> Performance Summary</h3>
                    <div className="metrics-grid-compact">
                        <div className="m-item"><span className="m-val">{analytics.totalQuestions}</span><span className="m-lbl">Questions</span></div>
                        <div className="m-item"><span className="m-val text-success">{analytics.correct}</span><span className="m-lbl">Correct</span></div>
                        <div className="m-item"><span className="m-val text-danger">{analytics.incorrect}</span><span className="m-lbl">Incorrect</span></div>
                        <div className="m-item"><span className="m-val text-warning">{analytics.unattempted}</span><span className="m-lbl">Skipped</span></div>
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
                        <div className={`performance-badge ${analytics.performanceCategory.color}`}>
                            {analytics.performanceCategory.label} Performance
                        </div>
                    </div>
                </div>
            </section>

            {/* AI Review Section */}
            <section className="ai-review-section">
                <div className="ai-review-card">
                    <div className="ai-header">
                        <div className="ai-title">
                            <FiZap className="zap-icon" />
                            <h3>AI Performance Review</h3>
                        </div>
                        {reviewLoading && <div className="shimmer-line"></div>}
                    </div>

                    {!reviewLoading && aiReview ? (
                        <div className="ai-content animate-fadeIn">
                            <div className="ai-grid">
                                <div className="ai-box strengths">
                                    <h4><FiCheckCircle /> Key Strengths</h4>
                                    <ul>
                                        {aiReview.strengths?.map((s, i) => <li key={i}>{s}</li>)}
                                    </ul>
                                </div>
                                <div className="ai-box weaknesses">
                                    <h4><FiTarget /> Areas for Improvement</h4>
                                    <ul>
                                        {aiReview.weaknesses?.map((w, i) => <li key={i}>{w}</li>)}
                                    </ul>
                                </div>
                            </div>
                            <div className="ai-tip-box">
                                <div className="tip-icon"><FiInfo /></div>
                                <div className="tip-text">
                                    <h5>Mentor's Tip</h5>
                                    <p>{aiReview.tip}</p>
                                </div>
                            </div>
                        </div>
                    ) : !reviewLoading ? (
                        <div className="ai-empty">
                            <p>AI Review is being prepared or unavailable for this session.</p>
                        </div>
                    ) : null}
                </div>
            </section>

            <section className="detailed-analysis">
                <div className="section-head"><h3><FiLayers /> Question-wise Analysis</h3></div>
                <div className="table-responsive">
                    <table className="analysis-table">
                        <thead>
                            <tr>
                                <th>Q.No</th><th>Topic</th><th>Question</th><th>Difficulty</th><th>Your Answer</th><th>Correct Ans</th><th>Status</th><th>Marks</th><th>Time(s)</th><th className="text-center">AI</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.answers.map((ans, idx) => {
                                const q = report.quizId.questions.find(q => q._id === ans.questionId);
                                const qId = q?._id;
                                const hasExplanation = !!explanations[qId];

                                return (
                                    <React.Fragment key={idx}>
                                        <tr className={`${ans.isCorrect ? 'row-correct' : 'row-incorrect'} ${hasExplanation ? 'has-explanation' : ''}`}>
                                            <td className="text-center">{idx + 1}</td>
                                            <td className="text-center font-mono">{q?.topic || 'General'}</td>
                                            <td className="q-cell" title={q?.text}>{q?.text?.substring(0, 60)}...</td>
                                            <td className="text-center"><span className={`diff-badge ${q?.difficulty || 'medium'}`}>{q?.difficulty || 'Medium'}</span></td>
                                            <td className="ans-cell font-mono">{ans.answer || '-'}</td>
                                            <td className="ans-cell font-mono">{q?.correctAnswer}</td>
                                            <td className="text-center status-cell">
                                                {ans.isCorrect ? <FiCheckCircle className="text-success" /> : <FiXCircle className="text-danger" />}
                                            </td>
                                            <td className="text-center font-bold">{ans.pointsEarned}</td>
                                            <td className="text-center">{(ans.timeTaken / 1000).toFixed(1)}</td>
                                            <td className="text-center">
                                                {hasExplanation ? (
                                                    <FiZap className="text-accent animate-pulse" />
                                                ) : (
                                                    <button
                                                        className="btn-analysis-icon"
                                                        onClick={() => handleAIExplain(ans, q)}
                                                        disabled={explainingQId === qId}
                                                        title="Analyze with AI"
                                                    >
                                                        {explainingQId === qId ? (
                                                            <span className="spinner-xs"></span>
                                                        ) : (
                                                            <FiZap />
                                                        )}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                        {hasExplanation && (
                                            <tr className="analysis-row animate-fadeIn">
                                                <td colSpan="10">
                                                    <div className="horizontal-analysis-box">
                                                        <div className="analysis-box-header">
                                                            <FiZap /> AI Analysis & Insights
                                                        </div>
                                                        <div className="analysis-box-content">
                                                            <FiInfo className="info-icon" />
                                                            <p>{explanations[qId]}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="leaderboard-snapshot">
                <div className="section-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3><FiAward /> Quiz Leaderboard</h3>
                    <button className="btn-text" onClick={() => setShowAllLeaderboard(!showAllLeaderboard)}>
                        {showAllLeaderboard ? 'Show Top 5' : 'Show All Participants'}
                    </button>
                </div>

                <FilterControls />

                <div className="leaderboard-table-wrapper professional-leaderboard">
                    <table className="analysis-table leaderboard-table">
                        <thead>
                            <tr><th>RANK</th><th>STUDENT DETAILS</th><th>BRANCH/SECTION</th><th>PERFORMANCE</th><th>TIME</th></tr>
                        </thead>
                        <tbody>
                            {(showAllLeaderboard ? getFilteredLeaderboard() : getFilteredLeaderboard().slice(0, 5)).map((lb, idx) => {
                                const s = lb.userId || {};
                                // Find global rank from full leaderboard using robust ID comparison
                                const currentRank = leaderboard.findIndex(p =>
                                    String(p.userId?._id || p.userId?.id || '') === String(s._id || s.id || '')
                                ) + 1;

                                const maxPossible = report.maxPossibleScore || 100;
                                const performancePercent = Math.round((lb.totalScore / maxPossible) * 100);
                                const totalParticipants = leaderboard.length;

                                // Determine highlight class
                                let highlights = [];
                                if (totalParticipants > 65) {
                                    if (currentRank <= 5) highlights.push('top-5-highlight');
                                } else {
                                    if (currentRank === 1) highlights.push('top-1-special');
                                }

                                if (String(user?._id || user?.id) === String(s._id || s.id)) {
                                    highlights.push('row-highlight');
                                }

                                return (
                                    <tr key={idx} className={highlights.join(' ')}>
                                        <td className="rank-col">
                                            {currentRank <= 3 ? (
                                                <span className={`rank-emoji rank-${currentRank}`}>
                                                    {['🥇', '🥈', '🥉'][currentRank - 1]}
                                                </span>
                                            ) : (
                                                <span className="rank-number">#{currentRank}</span>
                                            )}
                                        </td>
                                        <td className="student-col"><div className="student-meta"><span className="name">{s.name}</span><span className="roll">{s.rollNumber || 'N/A'}</span></div></td>
                                        <td className="branch-col"><div className="branch-meta"><span className="dept">{s.department || 'CSE'}</span><span className="sec">Section {s.section || 'E'}</span></div></td>
                                        <td className="performance-col"><div className="perf-meta"><span className="score-text"><strong>{lb.totalScore}</strong>/{maxPossible}</span><div className="perf-progress-bar"><div className="perf-progress-fill" style={{ width: `${performancePercent}%` }}></div></div></div></td>
                                        <td className="time-col font-bold">{Math.round((lb.totalTimeTaken || 0) / 1000)}s</td>
                                    </tr>
                                );
                            })}
                            {getFilteredLeaderboard().length === 0 && (
                                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No participants match the selected filters.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <div className="footer-actions" style={{ display: 'flex', gap: '1rem', marginTop: '3rem', paddingBottom: '2rem', borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        // If we came from PlayQuiz (status active), go to dashboard
                        // If we came from History, go back to History
                        if (window.history.length > 2) {
                            navigate(-1);
                        } else {
                            navigate('/dashboard');
                        }
                    }}
                >
                    <FiArrowLeft /> Back to Dashboard
                </button>
                <button
                    className="btn btn-outline"
                    onClick={() => navigate('/history')}
                >
                    <FiActivity /> All History
                </button>
            </div>

            <style>{`
                .report-container { max-width: 1200px; margin: 0 auto; padding: 2rem; background: var(--bg-primary); color: var(--text-primary); font-family: 'Inter', sans-serif; }
                .report-header { background: var(--bg-secondary); border-radius: 12px; padding: 2rem; box-shadow: var(--shadow-md); margin-bottom: 2rem; border-bottom: 4px solid var(--primary); }
                .header-top { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 1.5rem; margin-bottom: 1.5rem; }
                .institute-branding { display: flex; align-items: center; gap: 1.5rem; }
                .institute-info h2 { margin: 0; font-size: 1.4rem; color: var(--text-primary); font-weight: 800; }
                .institute-info p { margin: 0; color: var(--text-secondary); font-size: 0.9rem; letter-spacing: 1px; text-transform: uppercase; }
                .btn-print { background: var(--bg-tertiary); border: 1px solid var(--border); color: var(--text-primary); padding: 0.6rem 1.2rem; border-radius: 6px; display: flex; align-items: center; gap: 0.5rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
                .quiz-banner { display: flex; justify-content: space-between; align-items: flex-end; }
                .quiz-main-info h1 { font-size: 2.2rem; margin: 0 0 0.5rem 0; color: var(--primary); }
                .quiz-code { background: var(--bg-tertiary); color: var(--text-primary); display: inline-block; padding: 0.3rem 0.8rem; border-radius: 4px; font-weight: 700; font-size: 0.8rem; letter-spacing: 1px; border: 1px solid var(--border); }
                .quiz-meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2rem; }
                .meta-item { display: flex; flex-direction: column; }
                .meta-item .label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; }
                .meta-item .value { font-weight: 700; font-size: 1.1rem; color: var(--text-primary); }

                .student-profile-section { background: var(--bg-secondary); border-radius: 12px; padding: 1.5rem 2rem; box-shadow: var(--shadow-sm); margin-bottom: 2rem; border-left: 5px solid var(--accent); }
                .profile-card { display: flex; justify-content: space-between; align-items: center; }
                .profile-left { display: flex; align-items: center; gap: 1.5rem; }
                .avatar-circle { width: 60px; height: 60px; background: var(--primary); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: bold; }
                .student-details h3 { margin: 0 0 0.3rem 0; font-size: 1.4rem; color: var(--text-primary); }
                .student-details p { margin: 0; color: var(--text-secondary); }
                .profile-stats { display: flex; gap: 2.5rem; }
                .stat-box { display: flex; flex-direction: column; align-items: center; }
                .s-label { font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.3rem; }
                .s-value { font-size: 1.4rem; font-weight: 800; color: var(--text-primary); }
                .stat-box.highlight .s-value { color: var(--primary); font-size: 1.8rem; }

                .dashboard-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 2rem; margin-bottom: 2rem; }
                .dashboard-card { background: var(--bg-secondary); border-radius: 12px; padding: 1.5rem; box-shadow: var(--shadow-sm); }
                .dashboard-card h3 { display: flex; align-items: center; gap: 0.8rem; margin-top: 0; border-bottom: 1px solid var(--border); padding-bottom: 1rem; margin-bottom: 1.5rem; font-size: 1.2rem; color: var(--text-primary); }
                .metrics-grid-compact { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; text-align: center; }
                .m-item { background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; border: 1px solid var(--border); }
                .m-val { font-size: 1.8rem; font-weight: 800; display: block; color: var(--text-primary); }
                .m-lbl { font-size: 0.8rem; color: var(--text-secondary); }
                .insight-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.2rem; font-size: 0.95rem; color: var(--text-primary); }
                .progress-bar-wrapper { flex-grow: 1; height: 8px; background: var(--border); border-radius: 4px; margin: 0 1rem; overflow: hidden; }
                .progress-fill { height: 100%; border-radius: 4px; }
                .performance-badge { text-align: center; padding: 0.8rem; border-radius: 8px; font-weight: 700; margin-top: 1.5rem; text-transform: uppercase; letter-spacing: 1px; }
                .performance-badge.success { background: rgba(16, 185, 129, 0.15); color: var(--success); }
                .performance-badge.primary { background: rgba(30, 64, 175, 0.15); color: var(--primary); }
                .performance-badge.warning { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
                .performance-badge.danger { background: rgba(239, 68, 68, 0.15); color: var(--danger); }

                /* AI Review Section */
                .ai-review-section { margin-bottom: 2rem; }
                .ai-review-card { background: var(--bg-secondary); border-radius: 16px; padding: 2rem; box-shadow: var(--shadow-lg); border: 1px solid var(--border); position: relative; overflow: hidden; }
                .ai-review-card::before { content: ""; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: linear-gradient(to bottom, var(--primary), var(--accent)); }
                .ai-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
                .ai-title { display: flex; align-items: center; gap: 0.75rem; color: var(--primary); }
                .zap-icon { font-size: 1.5rem; filter: drop-shadow(0 0 5px var(--primary-light)); }
                .ai-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 1.5rem; }
                .ai-box { background: var(--bg-tertiary); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border); }
                .ai-box h4 { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; font-size: 1rem; color: var(--text-primary); }
                .ai-box ul { padding-left: 1.25rem; }
                .ai-box li { margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.95rem; }
                .ai-box.strengths h4 svg { color: var(--success); }
                .ai-box.weaknesses h4 svg { color: var(--danger); }
                .ai-tip-box { display: flex; gap: 1rem; background: rgba(var(--primary-rgb), 0.05); background-color: var(--bg-tertiary); padding: 1.25rem; border-radius: 12px; border: 1px solid var(--primary-light); }
                .tip-icon { font-size: 1.5rem; color: var(--primary); margin-top: 2px; }
                .tip-text h5 { margin: 0 0 0.25rem 0; font-size: 0.95rem; color: var(--text-primary); }
                .tip-text p { margin: 0; color: var(--text-secondary); font-size: 0.9rem; line-height: 1.5; font-style: italic; }

                .detailed-analysis { background: var(--bg-secondary); border-radius: 12px; padding: 2rem; box-shadow: var(--shadow-sm); margin-bottom: 2rem; }
                .section-head h3 { color: var(--text-primary); margin-top: 0; margin-bottom: 1.5rem; }
                .analysis-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
                .analysis-table th { text-align: left; padding: 1rem; border-bottom: 2px solid var(--border); color: var(--text-secondary); font-weight: 700; text-transform: uppercase; font-size: 0.8rem; }
                .analysis-table td { padding: 1rem; border-bottom: 1px solid var(--border); vertical-align: middle; color: var(--text-primary); }
                .diff-badge { padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.7rem; text-transform: uppercase; font-weight: 600; }
                .diff-badge.easy { background: rgba(16, 185, 129, 0.15); color: var(--success); }
                .diff-badge.medium { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
                .diff-badge.hard { background: rgba(239, 68, 68, 0.15); color: var(--danger); }
                .font-mono { font-family: var(--font-mono); font-size: 0.85rem; }
                .text-center { text-align: center; }
                .text-success { color: var(--success) !important; }
                .text-danger { color: var(--danger) !important; }
                .text-bold { font-weight: 700; }

                .leaderboard-snapshot { background: var(--bg-secondary); border-radius: 12px; padding: 2rem; box-shadow: var(--shadow-sm); margin-bottom: 3rem; }
                .professional-leaderboard { margin-top: 1rem; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--bg-secondary); }
                .professional-leaderboard .analysis-table th { background: var(--bg-tertiary); color: var(--text-secondary); font-size: 0.75rem; letter-spacing: 0.05em; padding: 1.25rem 1rem; border-bottom: 1px solid var(--border); }
                .professional-leaderboard .analysis-table td { padding: 1.25rem 1rem; border-bottom: 1px solid var(--border); }
                .rank-col { width: 100px; text-align: center; }
                .rank-emoji { font-size: 1.5rem; }
                .rank-number { color: var(--text-primary); font-size: 1.1rem; }
                .student-col { min-width: 250px; }
                .student-meta { display: flex; flex-direction: column; gap: 2px; }
                .student-meta .name { font-weight: 700; color: var(--text-primary); font-size: 1rem; text-transform: uppercase; }
                .student-meta .roll { font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono); }
                .branch-col { min-width: 150px; }
                .branch-meta { display: flex; flex-direction: column; gap: 2px; }
                .branch-meta .dept { font-weight: 700; color: var(--primary-light); font-size: 0.9rem; }
                .branch-meta .sec { font-size: 0.8rem; color: var(--text-secondary); }
                .performance-col { min-width: 200px; }
                .perf-meta { display: flex; flex-direction: column; gap: 8px; }
                .score-text { font-size: 0.95rem; color: var(--text-primary); }
                .perf-progress-bar { height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden; width: 140px; }
                .perf-progress-fill { height: 100%; background: var(--primary); border-radius: 4px; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
                .time-col { width: 120px; text-align: right; color: var(--text-secondary); padding-right: 2rem !important; }

                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fadeIn { animation: fadeIn 0.5s ease forwards; }
                .shimmer-line { height: 2px; background: linear-gradient(90deg, transparent, var(--primary), transparent); background-size: 200% 100%; animation: shimmer 1.5s infinite; width: 100px; }
                @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

                .btn-text { background: rgba(255, 127, 17, 0.1); color: #FF7F11; border: 2px solid #FF7F11; padding: 0.6rem 1.2rem; border-radius: var(--radius-md); font-weight: 800; cursor: pointer; transition: all 0.3s; display: inline-flex; align-items: center; gap: 0.6rem; text-decoration: none; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.5px; }
                .btn-text:hover { background: #FF7F11; color: white; transform: translateY(-3px); box-shadow: 0 6px 20px rgba(255, 127, 17, 0.4); }

                .btn-back { background: var(--gradient-primary); color: white; border: none; padding: 1rem 2.5rem; border-radius: var(--radius-lg); font-weight: 800; cursor: pointer; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); display: flex; align-items: center; gap: 0.75rem; box-shadow: 0 10px 30px rgba(30, 64, 175, 0.3); font-size: 1rem; }
                .btn-back:hover { transform: translateY(-5px) scale(1.02); box-shadow: 0 15px 40px rgba(30, 64, 175, 0.5); }

                .btn-analysis-icon { background: var(--bg-tertiary); color: var(--primary); border: 1px solid var(--border); width: 32px; height: 32px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; }
                .btn-analysis-icon:hover { background: var(--primary); color: white; transform: rotate(15deg); box-shadow: 0 4px 10px rgba(30, 64, 175, 0.3); }
                .btn-analysis-icon:disabled { opacity: 0.6; cursor: not-allowed; }

                .analysis-row td { padding: 0 !important; border-bottom: none !important; }
                .horizontal-analysis-box { background: var(--bg-secondary); border: 1px solid var(--border); border-top: none; border-left: 4px solid var(--accent); margin-bottom: 1.5rem; padding: 1.25rem; border-radius: 0 0 12px 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
                .analysis-box-header { display: flex; align-items: center; gap: 0.5rem; font-weight: 800; color: var(--accent); font-size: 0.85rem; text-transform: uppercase; margin-bottom: 0.75rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
                .analysis-box-content { display: flex; gap: 1rem; align-items: flex-start; }
                .analysis-box-content .info-icon { font-size: 1.2rem; color: var(--accent); flex-shrink: 0; margin-top: 2px; }
                .analysis-box-content p { margin: 0; font-size: 1rem; line-height: 1.6; color: var(--text-primary); font-style: italic; }

                .row-correct.has-explanation, .row-incorrect.has-explanation { border-bottom: none !important; }
                .row-correct.has-explanation td, .row-incorrect.has-explanation td { border-bottom: none !important; }

                .analysis-table tr { transition: background 0.2s; }
                .analysis-table tr:hover { background: rgba(0,0,0,0.02); }
                .row-correct:hover { background: rgba(16, 185, 129, 0.05) !important; }
                .row-incorrect:hover { background: rgba(239, 68, 68, 0.05) !important; }
                .text-accent { color: var(--accent) !important; }

                /* Leaderboard Highlights */
                /* Enhanced Gold Glow */
                .top-1-special { 
                    background: linear-gradient(90deg, rgba(255, 215, 0, 0.1), transparent) !important; 
                    border-left: 5px solid #FFD700 !important;
                    box-shadow: inset 5px 0 15px -5px rgba(255, 215, 0, 0.4);
                    position: relative;
                }
                
                .top-5-highlight { 
                    background: linear-gradient(90deg, rgba(30, 64, 175, 0.08), transparent) !important; 
                    border-left: 5px solid var(--primary) !important;
                    box-shadow: inset 5px 0 15px -5px rgba(30, 64, 175, 0.3);
                }
                .rank-1 { filter: drop-shadow(0 0 5px rgba(255, 215, 0, 0.6)); scale: 1.2; display: inline-block; }
                .rank-2 { filter: drop-shadow(0 0 4px rgba(192, 192, 192, 0.5)); scale: 1.1; display: inline-block; }
                .rank-3 { filter: drop-shadow(0 0 3px rgba(205, 127, 50, 0.4)); scale: 1.05; display: inline-block; }

                .spinner-xs { width: 12px; height: 12px; border: 2px solid rgba(0,0,0,0.1); border-top-color: var(--primary); border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg); } }

                /* Filter System Styles */
                .filter-system { display: flex; flex-direction: column; gap: 12px; margin-bottom: 25px; background: rgba(255, 255, 255, 0.02); padding: 15px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.05); }
                .filter-group { display: flex; align-items: center; gap: 12px; }
                .filter-group label { font-weight: 700; color: var(--text-secondary); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; min-width: 70px; }
                .filter-pills { display: flex; flex-wrap: wrap; gap: 8px; }
                .pill { padding: 4px 14px; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.1); background: transparent; color: var(--text-secondary); font-weight: 600; font-size: 0.8rem; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
                .pill:hover { background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.2); transform: translateY(-1px); }
                .pill.active { background: var(--primary); color: white; border-color: var(--primary); box-shadow: 0 4px 12px rgba(255, 127, 17, 0.3); }
                @keyframes slideInRight { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
                .animate-slideInRight { animation: slideInRight 0.3s ease-out forwards; }
            `}</style>
        </div>
    );
};

export default QuizReport;
