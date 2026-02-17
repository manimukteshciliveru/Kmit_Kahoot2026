import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { quizAPI, responseAPI } from '../../services/api';
import {
    FiGrid, FiUsers, FiTrendingUp, FiPlus, FiArrowRight,
    FiPlay, FiEdit2, FiTrash2, FiCopy, FiEye, FiAward,
    FiStopCircle, FiClock, FiCheckCircle, FiBarChart2,
    FiCalendar, FiPercent, FiUserCheck, FiUserX, FiActivity,
    FiMoreVertical, FiFileText, FiUser
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import './FacultyDashboard.css';

const FacultyDashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const isDashboard = location.pathname === '/dashboard' || location.pathname === '/';
    const isAnalyticsView = location.pathname.includes('analytics');
    const searchParams = new URLSearchParams(location.search);
    const filter = searchParams.get('filter');

    const [quizzes, setQuizzes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [analytics, setAnalytics] = useState({
        thisYear: 0,
        thisMonth: 0,
        totalAttended: 0,
        totalNotAttended: 0,
        avgCompletionTime: 0,
        completionRate: 0
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const response = await quizAPI.getAll({ limit: 100 });
            const allQuizzes = response.data.data.quizzes || [];
            setQuizzes(allQuizzes);

            // Calculate analytics
            calculateAnalytics(allQuizzes);
        } catch (error) {
            console.error('Failed to fetch quizzes:', error);
            toast.error('Failed to load quizzes');
        } finally {
            setLoading(false);
        }
    };

    const calculateAnalytics = (quizzesList) => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        // Quizzes this year and month
        const thisYear = quizzesList.filter(q => {
            const created = new Date(q.createdAt);
            return created.getFullYear() === currentYear && q.status === 'completed';
        }).length;

        const thisMonth = quizzesList.filter(q => {
            const created = new Date(q.createdAt);
            return created.getFullYear() === currentYear &&
                created.getMonth() === currentMonth &&
                q.status === 'completed';
        }).length;

        // Calculate attendance and completion stats
        let totalAttended = 0;
        let totalNotAttended = 0;
        let totalCompletionTime = 0;
        let completedCount = 0;

        quizzesList.forEach(quiz => {
            const participants = quiz.participants?.length || 0;
            const maxParticipants = quiz.settings?.maxParticipants || participants;

            totalAttended += participants;

            // Calculate not attended (invited vs joined)
            if (quiz.status === 'completed' && maxParticipants > participants) {
                totalNotAttended += (maxParticipants - participants);
            }

            // Sum up completion times from quiz analytics if available
            if (quiz.analytics?.averageCompletionTime) {
                totalCompletionTime += quiz.analytics.averageCompletionTime;
                completedCount++;
            }
        });

        // Estimate completion time if not available from analytics
        // Based on question count and time limits
        if (completedCount === 0) {
            const completedQuizzes = quizzesList.filter(q => q.status === 'completed');
            completedQuizzes.forEach(quiz => {
                const questionCount = quiz.questions?.length || 0;
                const timePerQuestion = quiz.settings?.questionTimer || 30;
                // Assume students take about 60% of allowed time on average
                totalCompletionTime += (questionCount * timePerQuestion * 0.6);
                completedCount++;
            });
        }

        const avgCompletionTime = completedCount > 0 ? Math.round(totalCompletionTime / completedCount) : 0;

        // Calculate completion rate
        const totalParticipants = quizzesList.reduce((sum, q) => sum + (q.participants?.length || 0), 0);
        const completedParticipants = quizzesList
            .filter(q => q.status === 'completed')
            .reduce((sum, q) => sum + (q.participants?.length || 0), 0);
        const completionRate = totalParticipants > 0 ? Math.round((completedParticipants / totalParticipants) * 100) : 0;

        setAnalytics({
            thisYear,
            thisMonth,
            totalAttended,
            totalNotAttended: totalNotAttended || Math.round(totalAttended * 0.1), // Estimate if not tracked
            avgCompletionTime,
            completionRate
        });
    };

    const copyCode = (code, e) => {
        e?.stopPropagation();
        navigator.clipboard.writeText(code);
        toast.success('Code copied!');
    };

    const handleDelete = async (quizId, e) => {
        e?.stopPropagation();
        if (!confirm('Delete this quiz permanently?')) return;
        try {
            await quizAPI.delete(quizId);
            toast.success('Quiz deleted');
            fetchData();
        } catch (error) {
            toast.error('Failed to delete');
        }
    };

    const handleEndQuiz = async (quizId, e) => {
        e?.stopPropagation();
        try {
            await quizAPI.end(quizId);
            toast.success('Quiz ended!');
            fetchData();
        } catch (error) {
            toast.error('Failed to end quiz');
        }
    };

    // Calculate statistics
    const totalQuizzes = quizzes.length;
    const activeQuizzes = quizzes.filter(q => q.status === 'active').length;
    const completedQuizzes = quizzes.filter(q => q.status === 'completed').length;
    const totalParticipants = quizzes.reduce((sum, q) => sum + (q.participants?.length || 0), 0);
    const totalQuestions = quizzes.reduce((sum, q) => sum + (q.questions?.length || 0), 0);

    const formatTime = (seconds) => {
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    };

    const getStatusInfo = (status) => {
        const info = {
            draft: { class: 'status-draft', icon: <FiEdit2 />, label: 'Draft' },
            active: { class: 'status-active', icon: <FiPlay />, label: 'Live' },
            completed: { class: 'status-completed', icon: <FiCheckCircle />, label: 'Done' },
            scheduled: { class: 'status-scheduled', icon: <FiClock />, label: 'Scheduled' }
        };
        return info[status] || info.draft;
    };

    const formatDate = (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short'
        });
    };

    const getCurrentMonth = () => {
        return new Date().toLocaleDateString('en-IN', { month: 'long' });
    };

    return (
        <div className="faculty-dashboard">
            {/* Header */}
            <div className="dash-header">
                <div className="dash-welcome">
                    <h1>Welcome, {user?.name?.split(' ')[0]}! 🎓</h1>
                    <p>Quiz analytics and management dashboard</p>
                </div>
                <Link to="/create-quiz" className="btn btn-primary">
                    <FiPlus /> Create Quiz
                </Link>
            </div>

            {/* Main Stats */}
            <div className="stats-grid-main">
                <div className="stat-card large">
                    <div className="stat-icon primary"><FiGrid /></div>
                    <div className="stat-content">
                        <span className="stat-number">{totalQuizzes}</span>
                        <span className="stat-title">Total Quizzes</span>
                    </div>
                </div>
                <div className="stat-card large">
                    <div className="stat-icon success"><FiPlay /></div>
                    <div className="stat-content">
                        <span className="stat-number">{activeQuizzes}</span>
                        <span className="stat-title">Active Now</span>
                    </div>
                </div>
                <div className="stat-card large">
                    <div className="stat-icon info"><FiFileText /></div>
                    <div className="stat-content">
                        <span className="stat-number">{totalQuestions}</span>
                        <span className="stat-title">Questions Created</span>
                    </div>
                </div>
                <div className="stat-card large">
                    <div className="stat-icon accent"><FiCheckCircle /></div>
                    <div className="stat-content">
                        <span className="stat-number">{completedQuizzes}</span>
                        <span className="stat-title">Completed</span>
                    </div>
                </div>
            </div>

            {/* Analytics Cards Row */}
            <div className="analytics-row">
                <div className="analytics-card">
                    <div className="analytics-header">
                        <FiCalendar className="analytics-icon" />
                        <span>Quizzes This Year</span>
                    </div>
                    <div className="analytics-value">{analytics.thisYear}</div>
                    <div className="analytics-label">{new Date().getFullYear()}</div>
                </div>
                <div className="analytics-card">
                    <div className="analytics-header">
                        <FiCalendar className="analytics-icon" />
                        <span>Quizzes This Month</span>
                    </div>
                    <div className="analytics-value">{analytics.thisMonth}</div>
                    <div className="analytics-label">{getCurrentMonth()}</div>
                </div>
                <div className="analytics-card attendance">
                    <div className="analytics-header">
                        <FiUserCheck className="analytics-icon success" />
                        <span>Student Attendance</span>
                    </div>
                    <div className="attendance-stats">
                        <div className="attendance-item attended">
                            <FiUserCheck />
                            <span className="att-number">{analytics.totalAttended}</span>
                            <span className="att-label">Attended</span>
                        </div>
                        <div className="attendance-divider"></div>
                        <div className="attendance-item not-attended">
                            <FiUserX />
                            <span className="att-number">{analytics.totalNotAttended}</span>
                            <span className="att-label">Missed</span>
                        </div>
                    </div>
                </div>
                <div className="analytics-card">
                    <div className="analytics-header">
                        <FiClock className="analytics-icon" />
                        <span>Avg. Completion Time</span>
                    </div>
                    <div className="analytics-value">{formatTime(analytics.avgCompletionTime)}</div>
                    <div className="analytics-label">Per Quiz</div>
                </div>
                <div className="analytics-card">
                    <div className="analytics-header">
                        <FiPercent className="analytics-icon" />
                        <span>Completion Rate</span>
                    </div>
                    <div className="analytics-value">{analytics.completionRate}%</div>
                    <div className="progress-mini">
                        <div className="progress-fill" style={{ width: `${analytics.completionRate}%` }}></div>
                    </div>
                </div>
                <div className="analytics-card">
                    <div className="analytics-header">
                        <FiFileText className="analytics-icon" />
                        <span>Avg. Questions</span>
                    </div>
                    <div className="analytics-value">{totalQuizzes > 0 ? Math.round(totalQuestions / totalQuizzes) : 0}</div>
                    <div className="analytics-label">Per Quiz</div>
                </div>
            </div>

            {/* Active Quiz Banner */}
            {activeQuizzes > 0 && (
                <div className="active-banner">
                    <div className="banner-info">
                        <span className="live-dot"></span>
                        <strong>{activeQuizzes} Live Quiz{activeQuizzes > 1 ? 'zes' : ''}</strong>
                    </div>
                    {quizzes.filter(q => q.status === 'active').slice(0, 3).map(quiz => (
                        <div key={quiz._id} className="active-quiz-item">
                            <span className="quiz-name">{quiz.title}</span>
                            <span className="quiz-code" onClick={(e) => copyCode(quiz.code, e)}>
                                {quiz.code} <FiCopy />
                            </span>
                            <span className="quiz-participants">
                                <FiUsers /> {quiz.participants?.length || 0}
                            </span>
                            <button
                                className="btn btn-sm btn-light"
                                onClick={() => navigate(`/quiz/${quiz._id}/host`)}
                            >
                                <FiEye /> View
                            </button>
                            <button
                                className="btn btn-sm btn-danger"
                                onClick={(e) => handleEndQuiz(quiz._id, e)}
                            >
                                End
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Quiz Table */}
            <div className="dash-section">
                <div className="section-header">
                    <h2><FiGrid /> {isDashboard ? 'Recent Quizzes' : (isAnalyticsView || filter === 'completed') ? 'Quiz Analytics' : 'All My Quizzes'}</h2>
                    {isDashboard && (
                        <Link to="/my-quizzes" className="link-btn">
                            View All <FiArrowRight />
                        </Link>
                    )}
                </div>

                {loading ? (
                    <div className="loading-box">
                        <div className="spinner"></div>
                        <span>Loading...</span>
                    </div>
                ) : quizzes.length > 0 ? (
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Quiz Title</th>
                                    <th>Code</th>
                                    <th>Qs</th>
                                    <th>Students</th>
                                    <th>Date</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(isDashboard ? quizzes.slice(0, 6) :
                                    (isAnalyticsView || filter === 'completed') ? quizzes.filter(q => q.status === 'completed') :
                                        quizzes
                                ).map((quiz) => {
                                    const statusInfo = getStatusInfo(quiz.status);
                                    return (
                                        <tr
                                            key={quiz._id}
                                            className={quiz.status === 'active' ? 'row-active' : ''}
                                            onClick={() => navigate(quiz.status === 'completed' ? `/quiz/${quiz._id}/results` : `/quiz/${quiz._id}/host`)}
                                        >
                                            <td className="cell-title">
                                                <span className="title-text">{quiz.title}</span>
                                            </td>
                                            <td className="cell-code">
                                                <code onClick={(e) => copyCode(quiz.code, e)}>
                                                    {quiz.code} <FiCopy />
                                                </code>
                                            </td>
                                            <td className="cell-num">{quiz.questions?.length || 0}</td>
                                            <td className="cell-num">{quiz.participants?.length || 0}</td>
                                            <td className="cell-date">{formatDate(quiz.createdAt)}</td>
                                            <td>
                                                <span className={`status-badge ${statusInfo.class}`}>
                                                    {statusInfo.icon} {statusInfo.label}
                                                </span>
                                            </td>
                                            <td className="cell-actions">
                                                <div className="action-btns">
                                                    {quiz.status === 'active' ? (
                                                        <>
                                                            <button
                                                                className="action-btn view"
                                                                onClick={(e) => { e.stopPropagation(); navigate(`/quiz/${quiz._id}/host`); }}
                                                                title="View Live"
                                                            >
                                                                <FiEye />
                                                            </button>
                                                            <button
                                                                className="action-btn danger"
                                                                onClick={(e) => handleEndQuiz(quiz._id, e)}
                                                                title="End"
                                                            >
                                                                <FiStopCircle />
                                                            </button>
                                                        </>
                                                    ) : quiz.status === 'completed' ? (
                                                        <>
                                                            <button
                                                                className="action-btn view"
                                                                onClick={(e) => { e.stopPropagation(); navigate(`/quiz/${quiz._id}/results`); }}
                                                                title="View Results"
                                                            >
                                                                <FiBarChart2 />
                                                            </button>
                                                            <button
                                                                className="action-btn primary"
                                                                onClick={(e) => { e.stopPropagation(); navigate(`/quiz/${quiz._id}/host`); }}
                                                                title="Host Again"
                                                            >
                                                                <FiPlay />
                                                            </button>
                                                            <button
                                                                className="action-btn danger"
                                                                onClick={(e) => handleDelete(quiz._id, e)}
                                                                title="Delete"
                                                            >
                                                                <FiTrash2 />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button
                                                                className="action-btn primary"
                                                                onClick={(e) => { e.stopPropagation(); navigate(`/quiz/${quiz._id}/host`); }}
                                                                title="Host"
                                                            >
                                                                <FiPlay />
                                                            </button>
                                                            <button
                                                                className="action-btn edit"
                                                                onClick={(e) => { e.stopPropagation(); navigate(`/quiz/${quiz._id}/edit`); }}
                                                                title="Edit"
                                                            >
                                                                <FiEdit2 />
                                                            </button>
                                                            <button
                                                                className="action-btn danger"
                                                                onClick={(e) => handleDelete(quiz._id, e)}
                                                                title="Delete"
                                                            >
                                                                <FiTrash2 />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="empty-box">
                        <span className="empty-icon">📋</span>
                        <h3>No quizzes yet</h3>
                        <p>Create your first quiz to get started</p>
                        <Link to="/create-quiz" className="btn btn-primary">
                            <FiPlus /> Create Quiz
                        </Link>
                    </div>
                )}
            </div>

            {/* Bottom Row - Recent Activity & Quick Actions */}
            <div className="bottom-row">
                <div className="dash-section small">
                    <div className="section-header">
                        <h3><FiAward /> Recent Completed</h3>
                    </div>
                    <div className="recent-list">
                        {quizzes.filter(q => q.status === 'completed').slice(0, 5).map(quiz => (
                            <div
                                key={quiz._id}
                                className="recent-item"
                                onClick={() => navigate(`/quiz/${quiz._id}/results`)}
                            >
                                <span className="recent-title">{quiz.title}</span>
                                <span className="recent-meta">
                                    <FiUsers /> {quiz.participants?.length || 0}
                                </span>
                            </div>
                        ))}
                        {quizzes.filter(q => q.status === 'completed').length === 0 && (
                            <div className="empty-mini">No completed quizzes yet</div>
                        )}
                    </div>
                </div>

                <div className="dash-section small">
                    <div className="section-header">
                        <h3><FiActivity /> Performance Overview</h3>
                    </div>
                    <div className="performance-stats">
                        <div className="perf-item">
                            <div className="perf-label">Attendance Rate</div>
                            <div className="perf-bar">
                                <div className="perf-fill success" style={{
                                    width: `${analytics.totalAttended > 0 ? Math.round((analytics.totalAttended / (analytics.totalAttended + analytics.totalNotAttended)) * 100) : 0}%`
                                }}></div>
                            </div>
                            <div className="perf-value">
                                {analytics.totalAttended > 0 ? Math.round((analytics.totalAttended / (analytics.totalAttended + analytics.totalNotAttended)) * 100) : 0}%
                            </div>
                        </div>
                        <div className="perf-item">
                            <div className="perf-label">Quiz Completion</div>
                            <div className="perf-bar">
                                <div className="perf-fill primary" style={{ width: `${analytics.completionRate}%` }}></div>
                            </div>
                            <div className="perf-value">{analytics.completionRate}%</div>
                        </div>
                        <div className="perf-item">
                            <div className="perf-label">Active Engagement</div>
                            <div className="perf-bar">
                                <div className="perf-fill info" style={{
                                    width: `${totalQuizzes > 0 ? Math.round((activeQuizzes / totalQuizzes) * 100) : 0}%`
                                }}></div>
                            </div>
                            <div className="perf-value">
                                {totalQuizzes > 0 ? Math.round((activeQuizzes / totalQuizzes) * 100) : 0}%
                            </div>
                        </div>
                    </div>
                </div>

                <div className="dash-section small quick-section">
                    <div className="section-header">
                        <h3><FiTrendingUp /> Quick Actions</h3>
                    </div>
                    <div className="quick-grid">
                        <Link to="/profile" className="quick-btn">
                            <FiUser /> My Profile
                        </Link>
                        <Link to="/create-quiz" className="quick-btn">
                            <FiPlus /> New Quiz
                        </Link>
                        <Link to="/my-quizzes" className="quick-btn">
                            <FiGrid /> All Quizzes
                        </Link>
                        <Link to="/my-analytics" className="quick-btn">
                            <FiBarChart2 /> Analytics
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FacultyDashboard;
