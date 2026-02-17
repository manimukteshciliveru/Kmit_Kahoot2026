import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { quizAPI } from '../../services/api';
import {
    FiArrowLeft,
    FiGrid,
    FiSearch,
    FiCalendar,
    FiUser,
    FiBarChart2,
    FiClock,
    FiCheckCircle,
    FiChevronRight
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import '../Dashboard.css';
import './AdminPages.css';

const QuizAnalytics = () => {
    const [loading, setLoading] = useState(true);
    const [quizzes, setQuizzes] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    useEffect(() => {
        fetchQuizzes();
    }, []);

    const fetchQuizzes = async () => {
        try {
            setLoading(true);
            const response = await quizAPI.getAll({ limit: 100 });
            setQuizzes(response.data.data?.quizzes || []);
        } catch (error) {
            console.error('Failed to fetch quizzes:', error);
            toast.error('Failed to load quizzes');
        } finally {
            setLoading(false);
        }
    };

    const filteredQuizzes = quizzes.filter(quiz => {
        const matchesSearch = quiz.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            quiz.code.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || quiz.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const formatDate = (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    return (
        <div className="admin-page quizzes-analytics-page">
            <div className="page-header">
                <div className="header-left">
                    <Link to="/dashboard" className="back-btn">
                        <FiArrowLeft /> Back to Dashboard
                    </Link>
                    <h1><FiGrid /> Quiz Analytics & Metrics</h1>
                </div>
            </div>

            <div className="filters-bar">
                <div className="search-box">
                    <input
                        type="text"
                        placeholder="Search by quiz title or code..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <FiSearch className="search-icon" />
                </div>
                <div className="status-tabs user-tabs" style={{ margin: '0' }}>
                    <button
                        className={`tab-btn ${statusFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setStatusFilter('all')}
                    >
                        All Quizzes
                    </button>
                    <button
                        className={`tab-btn ${statusFilter === 'completed' ? 'active' : ''}`}
                        onClick={() => setStatusFilter('completed')}
                    >
                        Completed
                    </button>
                    <button
                        className={`tab-btn ${statusFilter === 'live' ? 'active' : ''}`}
                        onClick={() => setStatusFilter('live')}
                    >
                        Live
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading quiz data...</p>
                </div>
            ) : (
                <div className="users-table-container">
                    <table className="users-table">
                        <thead>
                            <tr>
                                <th>Quiz Details</th>
                                <th>Created By</th>
                                <th>Date Conducted</th>
                                <th>Questions</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredQuizzes.length > 0 ? (
                                filteredQuizzes.map((quiz) => (
                                    <tr key={quiz._id}>
                                        <td>
                                            <div className="quiz-cell" style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span className="quiz-title" style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{quiz.title}</span>
                                                <span className="quiz-code" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Code: {quiz.code}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="user-info-cell" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <FiUser />
                                                <span>{quiz.createdBy?.name || 'Unknown'}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="date-cell" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <FiCalendar />
                                                <span>{formatDate(quiz.startedAt || quiz.createdAt)}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="stats-cell">
                                                <span className="badge badge-info">{quiz.questions?.length || 0} Questions</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`status-badge ${quiz.status}`}>
                                                {quiz.status}
                                            </span>
                                        </td>
                                        <td>
                                            <Link
                                                to={`/quiz/${quiz._id}/results`}
                                                className="btn btn-primary btn-sm"
                                                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                                            >
                                                <FiBarChart2 /> Detailed Analytics <FiChevronRight />
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" className="text-center" style={{ padding: '3rem' }}>
                                        <p className="text-muted">No quizzes found matching your criteria.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default QuizAnalytics;
