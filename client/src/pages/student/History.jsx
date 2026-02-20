import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { responseAPI, quizAPI } from '../../services/api';
import {
    FiClock, FiAward, FiDownload, FiChevronRight,
    FiTrendingUp, FiX, FiActivity, FiUser, FiBook, FiCheckCircle, FiXCircle, FiZap
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import '../common/Profile.css';

const History = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const response = await responseAPI.getHistory({ limit: 50 });
            setHistory(response.data.data.responses || []);
        } catch (error) {
            toast.error('Failed to load quiz history');
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (date) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const formatDate = (date) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const downloadReportCard = async (response) => {
        const quizTitle = response.quizId?.title || 'Quiz_Report';
        toast.loading('Preparing report card...', { id: 'csv-download' });

        try {
            let leaderboardRows = [];
            try {
                const lbRes = await quizAPI.getLeaderboard(response.quizId?._id);
                const lbData = lbRes.data.data.leaderboard || [];
                leaderboardRows = lbData.map(lb => [
                    lb.rank || '-',
                    lb.userId?.name || 'Unknown',
                    lb.totalScore,
                    lb.status
                ]);
            } catch (lbError) {
                console.error('Failed to fetch leaderboard for CSV:', lbError);
                leaderboardRows = [['Rankings hidden or unavailable']];
            }

            const headers = ['Question', 'Your Answer', 'Correct Answer', 'Status', 'Points', 'Time Taken'];
            const rows = response.answers.map(a => {
                const qDetail = response.quizId?.questions?.find(q => q._id === a.questionId);
                return [
                    `"${(qDetail?.text || 'Question deleted').replace(/"/g, '""')}"`,
                    `"${(a.answer || 'Skipped').replace(/"/g, '""')}"`,
                    `"${(qDetail?.correctAnswer || 'N/A').replace(/"/g, '""')}"`,
                    a.isCorrect ? 'Correct' : 'Incorrect',
                    `${a.pointsEarned}/${qDetail?.points || 0}`,
                    `${(a.timeTaken / 1000).toFixed(1)}s`
                ];
            });

            const summary = [
                ['QUIZ PERFORMANCE REPORT CARD'],
                ['Quiz Title', quizTitle],
                ['Subject', response.quizId?.subject || 'General'],
                ['Faculty', response.quizId?.createdBy?.name || 'N/A'],
                ['Student Name', user.name],
                ['Roll Number', user.rollNumber],
                ['Final Score', `${response.percentage}%`],
                ['Total Points', `${response.totalScore}/${response.maxPossibleScore}`],
                ['Rank', response.rank || 'N/A'],
                ['Participants', leaderboardRows.length],
                ['Date', formatDate(response.quizId?.startedAt || response.completedAt)],
                []
            ];

            const csvContent = [
                ...summary,
                ['DETAILED ANALYSIS'],
                headers,
                ...rows
            ].map(e => e.join(",")).join("\n");

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `ReportCard_${quizTitle.replace(/\s+/g, '_')}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success('Report card downloaded', { id: 'csv-download' });
        } catch (error) {
            toast.error('Failed to generate report card', { id: 'csv-download' });
        }
    };

    return (
        <div className="profile-container">
            <header className="profile-header">
                <div className="profile-info-main" style={{ paddingLeft: 'var(--space-md)' }}>
                    <h1>Quiz History & Results 📊</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Detailed track record of your academic performances.</p>
                </div>
            </header>

            <main className="profile-content">
                <div className="history-list">
                    {loading ? (
                        <div className="loading-state"><div className="spinner"></div></div>
                    ) : history.length > 0 ? (
                        history.map((resp) => (
                            <div key={resp._id} className="history-card extended">
                                <div className="history-details-main">
                                    <div className="quiz-primary-info">
                                        <h4>{resp.quizId?.title || 'Deleted Quiz'}</h4>
                                        <div className="faculty-subject">
                                            <span><FiUser /> Conducted by: <strong>{resp.quizId?.createdBy?.name || 'N/A'}</strong></span>
                                            <span className="divider">|</span>
                                            <span><FiBook /> Subject: <strong>{resp.quizId?.subject || 'General'}</strong></span>
                                        </div>
                                    </div>

                                    <div className="quiz-time-info">
                                        <div className="time-item">
                                            <span className="label">Conducted Date</span>
                                            <span className="value">{formatDate(resp.quizId?.startedAt || resp.completedAt)}</span>
                                        </div>
                                        <div className="time-item">
                                            <span className="label">Started Time</span>
                                            <span className="value">{formatTime(resp.quizId?.startedAt)}</span>
                                        </div>
                                        <div className="time-item">
                                            <span className="label">Ended Time</span>
                                            <span className="value">{formatTime(resp.quizId?.endedAt)}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="history-actions-stats">
                                    <div className="stats-mini">
                                        <span className={`score-badge ${resp.percentage >= 70 ? 'high' : resp.percentage >= 40 ? 'mid' : 'low'}`}>
                                            {resp.percentage}%
                                        </span>
                                        <span className="rank-mini">Rank #{resp.rank || 'N/A'}</span>
                                        <div className="ai-badge-mini">
                                            <FiZap /> AI Review Available
                                        </div>
                                    </div>
                                    <div className="action-buttons-group">
                                        <button className="btn btn-sm btn-outline" onClick={() => {
                                            navigate(`/history/report/${resp._id}`);
                                        }}>
                                            <FiActivity /> View Report
                                        </button>
                                        <button className="btn btn-sm btn-primary" onClick={() => downloadReportCard(resp)}>
                                            <FiDownload /> Download CSV
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="empty-state">
                            <h3>No quiz history found</h3>
                            <p>Once you complete a quiz, your results will appear here.</p>
                        </div>
                    )}
                </div>
            </main>

            <style>{`
                .history-card.extended { display: grid; grid-template-columns: 1fr; gap: 1.5rem; padding: 2rem; }
                .history-details-main { display: flex; justify-content: space-between; align-items: flex-start; gap: 2rem; }
                .quiz-primary-info h4 { font-size: 1.25rem; margin-bottom: 0.5rem; }
                .faculty-subject { display: flex; gap: 1rem; color: var(--text-muted); font-size: 0.9rem; align-items: center; }
                .faculty-subject strong { color: var(--text-primary); }
                .divider { color: var(--border); }
                .quiz-time-info { display: flex; gap: 2rem; }
                .time-item { display: flex; flex-direction: column; }
                .time-item .label { font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; letter-spacing: 0.5px; }
                .time-item .value { font-weight: 600; font-size: 0.9rem; }
                .history-actions-stats { display: flex; justify-content: space-between; align-items: center; padding-top: 1.5rem; border-top: 1px solid var(--border); }
                .stats-mini { display: flex; align-items: center; gap: 1rem; }
                .score-badge { padding: 4px 10px; border-radius: 99px; font-weight: 700; font-size: 0.9rem; background: var(--bg-tertiary); color: var(--text-primary); }
                .score-badge.high { background: rgba(16, 185, 129, 0.1); color: var(--success); }
                .score-badge.mid { background: rgba(245, 158, 11, 0.1); color: var(--warning); }
                .score-badge.low { background: rgba(239, 68, 68, 0.1); color: var(--danger); }
                .rank-mini { font-weight: 700; color: var(--text-secondary); font-size: 0.95rem; }
                .ai-badge-mini { display: flex; align-items: center; gap: 4px; background: rgba(var(--primary-rgb), 0.1); background-color: #EEF2FF; color: var(--primary); padding: 4px 10px; border-radius: 99px; font-size: 0.75rem; font-weight: 700; border: 1px solid var(--primary-light); }
                .ai-badge-mini svg { color: var(--primary); }
                .action-buttons-group { display: flex; gap: 0.75rem; }
                .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text-primary); }
                .btn-outline:hover { border-color: var(--primary); color: var(--primary); }

                @media (max-width: 900px) { .history-details-main { flex-direction: column; gap: 1.25rem; } .quiz-time-info { width: 100%; justify-content: space-between; flex-wrap: wrap; } }
                @media (max-width: 600px) { .history-actions-stats { flex-direction: column; gap: 1.25rem; align-items: flex-start; } .action-buttons-group { width: 100%; flex-direction: column; } }
            `}</style>
        </div>
    );
};

export default History;
