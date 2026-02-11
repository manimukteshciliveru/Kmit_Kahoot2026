import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { userAPI, quizAPI } from '../../services/api';
import {
    FiArrowLeft,
    FiBarChart2,
    FiUsers,
    FiGrid,
    FiTrendingUp,
    FiAward,
    FiClock,
    FiCheckCircle,
    FiAlertCircle
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import '../Dashboard.css';
import './AdminPages.css';

const Analytics = () => {
    const [loading, setLoading] = useState(true);
    const [analytics, setAnalytics] = useState(null);
    const [quizzes, setQuizzes] = useState([]);
    const [selectedPeriod, setSelectedPeriod] = useState('all');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [analyticsRes, quizzesRes] = await Promise.allSettled([
                userAPI.getAnalytics(),
                quizAPI.getAll({ limit: 100 })
            ]);

            if (analyticsRes.status === 'fulfilled') {
                setAnalytics(analyticsRes.value.data.data);
            }
            if (quizzesRes.status === 'fulfilled') {
                setQuizzes(quizzesRes.value.data.data || []);
            }
        } catch (error) {
            console.error('Failed to fetch analytics:', error);
            toast.error('Failed to load analytics data');
        } finally {
            setLoading(false);
        }
    };

    // Calculate quiz statistics
    const quizStats = quizzes.reduce((acc, quiz) => {
        acc.totalQuizzes++;
        acc.totalQuestions += quiz.questions?.length || 0;
        if (quiz.status === 'completed') {
            acc.completedQuizzes++;
        }
        if (quiz.status === 'live') {
            acc.liveQuizzes++;
        }
        return acc;
    }, { totalQuizzes: 0, totalQuestions: 0, completedQuizzes: 0, liveQuizzes: 0 });

    // Group quizzes by faculty
    const quizzesByFaculty = quizzes.reduce((acc, quiz) => {
        const facultyName = quiz.createdBy?.name || 'Unknown';
        if (!acc[facultyName]) {
            acc[facultyName] = { count: 0, questions: 0, responses: 0 };
        }
        acc[facultyName].count++;
        acc[facultyName].questions += quiz.questions?.length || 0;
        return acc;
    }, {});

    const facultyLeaderboard = Object.entries(quizzesByFaculty)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    return (
        <div className="admin-page analytics-page">
            <div className="page-header">
                <div className="header-left">
                    <Link to="/dashboard" className="back-btn">
                        <FiArrowLeft /> Back
                    </Link>
                    <h1><FiBarChart2 /> Platform Analytics</h1>
                </div>
                <div className="period-selector">
                    <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
                        <option value="all">All Time</option>
                        <option value="month">This Month</option>
                        <option value="week">This Week</option>
                    </select>
                </div>
            </div>

            {loading ? (
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading analytics...</p>
                </div>
            ) : (
                <>
                    {/* Overview Stats */}
                    <div className="stats-grid analytics-stats">
                        <div className="stat-card stat-primary">
                            <div className="stat-icon"><FiUsers /></div>
                            <div className="stat-info">
                                <span className="stat-value">{analytics?.users?.total || 0}</span>
                                <span className="stat-label">Total Users</span>
                                <span className="stat-subtext">{analytics?.users?.active || 0} active</span>
                            </div>
                        </div>
                        <div className="stat-card stat-accent">
                            <div className="stat-icon"><FiGrid /></div>
                            <div className="stat-info">
                                <span className="stat-value">{quizStats.totalQuizzes}</span>
                                <span className="stat-label">Total Quizzes</span>
                                <span className="stat-subtext">{quizStats.totalQuestions} questions</span>
                            </div>
                        </div>
                        <div className="stat-card stat-success">
                            <div className="stat-icon"><FiCheckCircle /></div>
                            <div className="stat-info">
                                <span className="stat-value">{quizStats.completedQuizzes}</span>
                                <span className="stat-label">Completed</span>
                                <span className="stat-subtext">sessions finished</span>
                            </div>
                        </div>
                        <div className="stat-card stat-warning">
                            <div className="stat-icon"><FiClock /></div>
                            <div className="stat-info">
                                <span className="stat-value">{quizStats.liveQuizzes}</span>
                                <span className="stat-label">Live Now</span>
                                <span className="stat-subtext">active sessions</span>
                            </div>
                        </div>
                    </div>

                    <div className="analytics-grid">
                        {/* Faculty Leaderboard */}
                        <div className="dashboard-card">
                            <div className="card-header">
                                <h2><FiAward /> Faculty Quiz Leaderboard</h2>
                            </div>
                            <div className="card-body">
                                {facultyLeaderboard.length > 0 ? (
                                    <div className="leaderboard">
                                        {facultyLeaderboard.map((faculty, index) => (
                                            <div key={faculty.name} className="leaderboard-item">
                                                <span className="rank">#{index + 1}</span>
                                                <div className="faculty-info">
                                                    <span className="faculty-name">{faculty.name}</span>
                                                    <span className="faculty-stats">
                                                        {faculty.count} quizzes • {faculty.questions} questions
                                                    </span>
                                                </div>
                                                <div className="quiz-count-bar">
                                                    <div
                                                        className="fill"
                                                        style={{
                                                            width: `${(faculty.count / facultyLeaderboard[0].count) * 100}%`
                                                        }}
                                                    ></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-muted">No quiz data available yet.</p>
                                )}
                            </div>
                        </div>

                        {/* Recent Quizzes */}
                        <div className="dashboard-card">
                            <div className="card-header">
                                <h2><FiTrendingUp /> Recent Quizzes</h2>
                            </div>
                            <div className="card-body">
                                {quizzes.slice(0, 10).length > 0 ? (
                                    <div className="recent-quizzes-list">
                                        {quizzes.slice(0, 10).map(quiz => (
                                            <div key={quiz._id} className="quiz-item">
                                                <div className="quiz-info">
                                                    <span className="quiz-title">{quiz.title}</span>
                                                    <span className="quiz-meta">
                                                        by {quiz.createdBy?.name || 'Unknown'} •
                                                        {quiz.questions?.length || 0} questions
                                                    </span>
                                                </div>
                                                <span className={`status-badge ${quiz.status}`}>
                                                    {quiz.status}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-muted">No quizzes created yet.</p>
                                )}
                            </div>
                        </div>

                        {/* User Distribution */}
                        <div className="dashboard-card">
                            <div className="card-header">
                                <h2><FiUsers /> User Distribution</h2>
                            </div>
                            <div className="card-body">
                                <div className="distribution-chart">
                                    <div className="dist-row">
                                        <span className="dist-label">Students</span>
                                        <div className="dist-bar">
                                            <div
                                                className="dist-fill students"
                                                style={{ width: `${analytics?.users?.total ? (analytics.users.students / analytics.users.total) * 100 : 0}%` }}
                                            ></div>
                                        </div>
                                        <span className="dist-value">{analytics?.users?.students || 0}</span>
                                    </div>
                                    <div className="dist-row">
                                        <span className="dist-label">Faculty</span>
                                        <div className="dist-bar">
                                            <div
                                                className="dist-fill faculty"
                                                style={{ width: `${analytics?.users?.total ? (analytics.users.faculty / analytics.users.total) * 100 : 0}%` }}
                                            ></div>
                                        </div>
                                        <span className="dist-value">{analytics?.users?.faculty || 0}</span>
                                    </div>
                                    <div className="dist-row">
                                        <span className="dist-label">Admins</span>
                                        <div className="dist-bar">
                                            <div
                                                className="dist-fill admins"
                                                style={{ width: `${analytics?.users?.total ? (analytics.users.admins / analytics.users.total) * 100 : 0}%` }}
                                            ></div>
                                        </div>
                                        <span className="dist-value">{analytics?.users?.admins || 0}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* System Alerts (Placeholder) */}
                        <div className="dashboard-card">
                            <div className="card-header">
                                <h2><FiAlertCircle /> System Alerts</h2>
                            </div>
                            <div className="card-body">
                                <div className="alerts-list">
                                    <div className="alert-item info">
                                        <FiCheckCircle />
                                        <span>All systems operational</span>
                                    </div>
                                    {quizStats.liveQuizzes > 0 && (
                                        <div className="alert-item warning">
                                            <FiClock />
                                            <span>{quizStats.liveQuizzes} live quiz session(s) in progress</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default Analytics;
