import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { responseAPI } from '../../services/api';
import {
    FiGrid,
    FiAward,
    FiTrendingUp,
    FiClock,
    FiArrowRight,
    FiZap
} from 'react-icons/fi';
import '../Dashboard.css';

const StudentDashboard = () => {
    const { user } = useAuth();
    const [recentQuizzes, setRecentQuizzes] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchRecentQuizzes();
    }, []);

    const fetchRecentQuizzes = async () => {
        try {
            const response = await responseAPI.getHistory({ limit: 5 });
            setRecentQuizzes(response.data.data.responses || []);
        } catch (error) {
            console.error('Failed to fetch recent quizzes:', error);
        } finally {
            setLoading(false);
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
                        <h2>Recent Quizzes</h2>
                        <Link to="/history" className="view-all">
                            View All <FiArrowRight />
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
                                    <div key={response._id} className="quiz-item">
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
                                    </div>
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
                            <Link to="/history" className="action-item">
                                <div className="action-icon secondary">
                                    <FiClock />
                                </div>
                                <span>View History</span>
                            </Link>
                            <Link to="/profile" className="action-item">
                                <div className="action-icon accent">
                                    <FiAward />
                                </div>
                                <span>My Profile</span>
                            </Link>
                            <Link to="/leaderboard" className="action-item">
                                <div className="action-icon info">
                                    <FiTrendingUp />
                                </div>
                                <span>Leaderboard</span>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentDashboard;
