import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { quizAPI, responseAPI } from '../../services/api';
import {
    FiGrid,
    FiAward,
    FiTrendingUp,
    FiClock,
    FiArrowRight,
    FiZap,
    FiUser
} from 'react-icons/fi';
import '../Dashboard.css';

const StudentDashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { on } = useSocket();
    const [recentQuizzes, setRecentQuizzes] = useState([]);
    const [upcomingQuizzes, setUpcomingQuizzes] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            await Promise.all([
                fetchRecentQuizzes(),
                fetchUpcomingQuizzes()
            ]);
            setLoading(false);
        };
        fetchAll();
    }, []);

    useEffect(() => {
        if (!on) return;

        const handleStatusUpdate = (data) => {
            console.log('Real-time status update:', data);
            setUpcomingQuizzes(prev => prev.map(q =>
                q._id === data.quizId ? { ...q, status: data.status } : q
            ));
        };

        const cleanup = on('quiz:status_update', handleStatusUpdate);
        return () => {
            if (cleanup) cleanup();
        };
    }, [on]);

    const fetchRecentQuizzes = async () => {
        try {
            const response = await responseAPI.getHistory({ limit: 5 });
            setRecentQuizzes(response.data.data.responses || []);
        } catch (error) {
            console.error('Failed to fetch recent quizzes:', error);
        }
    };

    const fetchUpcomingQuizzes = async () => {
        try {
            // Fetch quizzes with default status (active, scheduled) for students
            const response = await quizAPI.getAll({ limit: 10 });
            setUpcomingQuizzes(response.data.data.quizzes || []);
        } catch (error) {
            console.error('Failed to fetch upcoming quizzes:', error);
        }
    };

    const stats = [
        {
            icon: <FiGrid />,
            label: 'Quizzes Taken',
            value: user?.stats?.quizzesAttended || 0,
            color: 'primary'
        },
        {
            icon: <FiTrendingUp />,
            label: 'Average Score',
            value: `${user?.stats?.averageScore || 0}%`,
            color: 'success'
        },
        {
            icon: <FiAward />,
            label: 'Total Points',
            value: user?.stats?.totalPoints || 0,
            color: 'accent'
        },
        {
            icon: <FiZap />,
            label: 'Best Rank',
            value: user?.stats?.bestRank ? `#${user.stats.bestRank}` : 'N/A',
            color: 'info'
        }
    ];

    return (
        <div className="dashboard">
            <div className="dashboard-header">
                <div className="welcome-section">
                    <h1>Welcome back, {user?.name?.split(' ')[0]}! 👋</h1>
                    <p>Ready to test your knowledge? Join a quiz and climb the leaderboard!</p>
                </div>
                <Link to="/join-quiz" className="btn btn-primary btn-lg">
                    <FiGrid />
                    Join Quiz
                </Link>
            </div>

            <div className="stats-grid">
                {stats.map((stat, index) => (
                    <div
                        key={stat.label}
                        className={`stat-card stat-${stat.color}`}
                        style={{ animationDelay: `${index * 100}ms` }}
                    >
                        <div className="stat-icon">{stat.icon}</div>
                        <div className="stat-info">
                            <span className="stat-value">{stat.value}</span>
                            <span className="stat-label">{stat.label}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="dashboard-row">
                <div className="dashboard-card">
                    <div className="card-header">
                        <h2>Available Quizzes</h2>
                        <span className="badge badge-info">{upcomingQuizzes.length} Available</span>
                    </div>
                    <div className="card-body">
                        {loading ? (
                            <div className="loading-state">
                                <div className="spinner"></div>
                            </div>
                        ) : upcomingQuizzes.length > 0 ? (
                            <div className="quiz-list">
                                {upcomingQuizzes.map((quiz) => (
                                    <div key={quiz._id} className="quiz-item">
                                        <div className="quiz-info">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <h3>{quiz.title}</h3>
                                                <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>{quiz.subject}</span>
                                            </div>
                                            <span className="quiz-meta">
                                                <FiClock />
                                                {quiz.status === 'active' ? (
                                                    <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>Live Now</span>
                                                ) : (
                                                    `Scheduled: ${quiz.scheduledAt ? new Date(quiz.scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Soon'}`
                                                )}
                                            </span>
                                        </div>
                                        <div className="quiz-status" style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                                            <div className={`status-badge ${quiz.status === 'active' ? 'active' : quiz.status === 'finished' ? 'finished' : 'scheduled'}`}>
                                                {quiz.status === 'active' ? 'Live' : quiz.status === 'finished' ? 'Finished' : 'Upcoming'}
                                            </div>
                                            <button
                                                className={`btn btn-sm ${quiz.status === 'active' ? 'btn-primary' : 'btn-ghost'}`}
                                                onClick={() => quiz.status !== 'finished' && navigate(`/quiz/${quiz._id}/play`)}
                                                style={{ fontSize: '0.75rem', padding: '4px 12px' }}
                                                disabled={quiz.status === 'finished'}
                                            >
                                                {quiz.status === 'active' ? 'Join Now' : quiz.status === 'finished' ? 'Ended' : 'Enter Lobby'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-state small">
                                <p>No quizzes available for your section at this time.</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="dashboard-card">
                    <div className="card-header">
                        <h2>Recent Quizzes</h2>
                        <Link to="/history" className="view-all">
                            Test Analytics <FiArrowRight />
                        </Link>
                    </div>
                    <div className="card-body">
                        {loading ? (
                            <div className="loading-state">
                                <div className="spinner"></div>
                                <p>Loading...</p>
                            </div>
                        ) : recentQuizzes.length > 0 ? (
                            <div className="quiz-list">
                                {recentQuizzes.map((response) => (
                                    <Link key={response._id} to="/history" className="quiz-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                                        <div className="quiz-info">
                                            <h3>{response.quizId?.title || 'Unknown Quiz'}</h3>
                                            <span className="quiz-meta">
                                                <FiClock />
                                                {new Date(response.completedAt || response.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <div className="quiz-score">
                                            <span className={`score ${response.percentage >= 70 ? 'high' : response.percentage >= 40 ? 'medium' : 'low'}`}>
                                                {response.percentage}%
                                            </span>
                                            {response.rank && (
                                                <span className="rank">Rank #{response.rank}</span>
                                            )}
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-state">
                                <span className="empty-icon">📝</span>
                                <h3>No quizzes yet</h3>
                                <p>Join your first quiz to start tracking your progress!</p>
                                <Link to="/join-quiz" className="btn btn-primary">
                                    Join a Quiz
                                </Link>
                            </div>
                        )}
                    </div>
                </div>

                <div className="dashboard-card quick-actions">
                    <div className="card-header">
                        <h2>Quick Actions</h2>
                    </div>
                    <div className="card-body">
                        <div className="action-grid">
                            <Link to="/join-quiz" className="action-item">
                                <div className="action-icon primary">
                                    <FiGrid />
                                </div>
                                <span>Join Quiz</span>
                            </Link>
                            <Link to="/profile" className="action-item">
                                <div className="action-icon accent">
                                    <FiUser />
                                </div>
                                <span>My Profile</span>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentDashboard;
