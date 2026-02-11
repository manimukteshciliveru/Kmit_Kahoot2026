import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { quizAPI } from '../../services/api';
import {
    FiGrid, FiPlay, FiCheckCircle, FiClock, FiActivity,
    FiBarChart2, FiUsers, FiTrendingUp, FiAward
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import './FacultyDashboard.css';

const FacultyAnalytics = () => {
    const navigate = useNavigate();
    const [quizzes, setQuizzes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalAttended: 0,
        avgScore: 0,
        completionRate: 0,
        topStudents: [], // Mock or calculate
        laggingStudents: [] // Mock or calculate
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const response = await quizAPI.getAll({ limit: 100 });
            const allQuizzes = response.data.data.quizzes || [];
            const completed = allQuizzes.filter(q => q.status === 'completed');
            setQuizzes(completed);
            calculateStats(completed);
        } catch (error) {
            toast.error('Failed to load analytics');
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = (completedQuizzes) => {
        // Basic calculation
        const totalParticipants = completedQuizzes.reduce((sum, q) => sum + (q.participants?.length || 0), 0);

        // Mock average score calculation if not available
        // In real scenario, would iterate through participants scores
        const avgScore = 78; // Placeholder/Global average

        setStats({
            totalAttended: totalParticipants,
            avgScore,
            completionRate: 92, // Placeholder
            topStudents: ['Alice Johnson', 'Bob Smith'],
            laggingStudents: ['Charlie Brown']
        });
    };

    const formatDate = (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    return (
        <div className="faculty-dashboard">
            <div className="dash-header">
                <div>
                    <h1>Analytics Dashboard</h1>
                    <p>Comprehensive performance reports and insights</p>
                </div>
            </div>

            {/* Overview Stats */}
            <div className="stats-grid-main">
                <div className="stat-card large">
                    <div className="stat-icon success"><FiCheckCircle /></div>
                    <div className="stat-content">
                        <span className="stat-number">{quizzes.length}</span>
                        <span className="stat-title">Quizzes Completed</span>
                    </div>
                </div>
                <div className="stat-card large">
                    <div className="stat-icon primary"><FiUsers /></div>
                    <div className="stat-content">
                        <span className="stat-number">{stats.totalAttended}</span>
                        <span className="stat-title">Total Participants</span>
                    </div>
                </div>
                <div className="stat-card large">
                    <div className="stat-icon accent"><FiAward /></div>
                    <div className="stat-content">
                        <span className="stat-number">{stats.avgScore}%</span>
                        <span className="stat-title">Average Class Score</span>
                    </div>
                </div>
                <div className="stat-card large">
                    <div className="stat-icon info"><FiActivity /></div>
                    <div className="stat-content">
                        <span className="stat-number">{stats.completionRate}%</span>
                        <span className="stat-title">Completion Rate</span>
                    </div>
                </div>
            </div>

            {/* Performance Insights */}
            <div className="dash-section">
                <div className="section-header">
                    <h3><FiTrendingUp /> Performance Feedack</h3>
                </div>
                <div className="analytics-row">
                    <div className="analytics-card" style={{ flex: 1 }}>
                        <div className="analytics-header">Top Performers</div>
                        <ul style={{ listStyle: 'none', padding: 0 }}>
                            {stats.topStudents.map((s, i) => (
                                <li key={i} style={{ padding: '8px 0', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{s}</span>
                                    <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>High Distinction</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="analytics-card" style={{ flex: 1 }}>
                        <div className="analytics-header">Needs Improvement</div>
                        <ul style={{ listStyle: 'none', padding: 0 }}>
                            {stats.laggingStudents.map((s, i) => (
                                <li key={i} style={{ padding: '8px 0', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{s}</span>
                                    <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>Review Needed</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Detailed Quiz List */}
            <div className="dash-section">
                <div className="section-header">
                    <h3><FiBarChart2 /> Detailed Reports</h3>
                </div>
                {loading ? (
                    <div className="loading-box"><div className="spinner"></div></div>
                ) : quizzes.length > 0 ? (
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Quiz Title</th>
                                    <th>Date Conducted</th>
                                    <th>Participants</th>
                                    <th>Avg. Score</th>
                                    <th>Pass Rate</th>
                                    <th>Completion</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {quizzes.map(quiz => {
                                    const avgScore = quiz.analytics?.avgScore || 0;
                                    const passRate = quiz.analytics?.passRate || 0;
                                    const total = quiz.participants?.length || 1;
                                    const completed = quiz.analytics?.completedCount || quiz.participants?.length || 0;
                                    const completionRate = Math.round((completed / total) * 100) || 0;

                                    return (
                                        <tr
                                            key={quiz._id}
                                            onClick={() => navigate(`/quiz/${quiz._id}/results`)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <td className="cell-title"><span className="title-text">{quiz.title}</span></td>
                                            <td className="cell-date">{formatDate(quiz.createdAt)}</td>
                                            <td className="cell-num">{quiz.participants?.length || 0}</td>
                                            <td className="cell-num" style={{ fontWeight: 'bold', color: avgScore >= 70 ? 'var(--success)' : 'var(--text-primary)' }}>
                                                {avgScore > 0 ? `${avgScore}%` : '-'}
                                            </td>
                                            <td className="cell-num">
                                                {passRate > 0 ? `${passRate}%` : '-'}
                                            </td>
                                            <td className="cell-num">
                                                {completionRate}%
                                            </td>
                                            <td className="cell-actions">
                                                <button className="action-btn view" title="View Report">
                                                    <FiBarChart2 /> Report
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="empty-box">
                        <h3>No analytics available yet</h3>
                        <p>Complete some quizzes to see reports here.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FacultyAnalytics;
