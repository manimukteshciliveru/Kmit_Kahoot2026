import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { quizAPI } from '../../services/api';
import {
    FiGrid, FiPlay, FiCheckCircle, FiClock, FiEdit2,
    FiTrash2, FiCopy, FiEye, FiBarChart2, FiPlus
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import './FacultyDashboard.css';

const MyQuizzes = () => {
    const navigate = useNavigate();
    const [quizzes, setQuizzes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        fetchQuizzes();
    }, []);

    const fetchQuizzes = async () => {
        try {
            const response = await quizAPI.getAll({ limit: 100 });
            setQuizzes(response.data.data.quizzes || []);
        } catch (error) {
            toast.error('Failed to load quizzes');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (quizId, e) => {
        e?.stopPropagation();
        if (!confirm('Delete this quiz permanently?')) return;
        try {
            await quizAPI.delete(quizId);
            toast.success('Quiz deleted');
            fetchQuizzes();
        } catch (error) {
            toast.error('Failed to delete');
        }
    };

    const copyCode = (code, e) => {
        e?.stopPropagation();
        navigator.clipboard.writeText(code);
        toast.success('Code copied!');
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

    const filteredQuizzes = quizzes.filter(q => {
        if (filter === 'all') return true;
        return q.status === filter;
    });

    return (
        <div className="faculty-dashboard">
            <div className="dash-header">
                <div>
                    <h1>My Quizzes</h1>
                    <p>Manage all your quizzes in one place</p>
                </div>
                <Link to="/create-quiz" className="btn btn-primary">
                    <FiPlus /> New Quiz
                </Link>
            </div>

            {/* Filter Tabs */}
            <div className="filter-tabs" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                {['all', 'active', 'draft', 'completed'].map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        style={{
                            textTransform: 'capitalize',
                            padding: '0.6rem 1.5rem',
                            borderRadius: '8px',
                            border: filter === f ? 'none' : '1px solid var(--border-color)',
                            background: filter === f ? 'var(--primary)' : 'var(--bg-card)',
                            color: filter === f ? '#fff' : 'var(--text-primary)',
                            fontWeight: '600',
                            fontSize: '0.95rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: filter === f ? '0 4px 12px rgba(255, 127, 17, 0.3)' : 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        {f === 'active' && <FiPlay />}
                        {f === 'draft' && <FiEdit2 />}
                        {f === 'completed' && <FiCheckCircle />}
                        {f === 'all' && <FiGrid />}
                        {f}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="loading-box"><div className="spinner"></div></div>
            ) : filteredQuizzes.length > 0 ? (
                <div className="dash-section">
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Title</th>
                                    <th>Code</th>
                                    <th>Qs</th>
                                    <th>Students</th>
                                    <th>Date</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredQuizzes.map(quiz => {
                                    const statusInfo = getStatusInfo(quiz.status);
                                    return (
                                        <tr
                                            key={quiz._id}
                                            onClick={() => navigate(quiz.status === 'completed' ? `/quiz/${quiz._id}/results` : `/quiz/${quiz._id}/host`)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <td className="cell-title"><span className="title-text">{quiz.title}</span></td>
                                            <td className="cell-code"><code onClick={(e) => copyCode(quiz.code, e)}>{quiz.code} <FiCopy /></code></td>
                                            <td className="cell-num">{quiz.questions?.length || 0}</td>
                                            <td className="cell-num">{quiz.participants?.length || 0}</td>
                                            <td className="cell-date">{formatDate(quiz.createdAt)}</td>
                                            <td><span className={`status-badge ${statusInfo.class}`}>{statusInfo.icon} {statusInfo.label}</span></td>
                                            <td className="cell-actions">
                                                <div className="action-btns">
                                                    <button className="action-btn view" onClick={(e) => { e.stopPropagation(); navigate(`/quiz/${quiz._id}/${quiz.status === 'completed' ? 'results' : 'host'}`); }}>
                                                        {quiz.status === 'completed' ? <FiBarChart2 /> : <FiEye />}
                                                    </button>
                                                    <button className="action-btn edit" onClick={(e) => { e.stopPropagation(); navigate(`/quiz/${quiz._id}/edit`); }}>
                                                        <FiEdit2 />
                                                    </button>
                                                    <button className="action-btn danger" onClick={(e) => handleDelete(quiz._id, e)}>
                                                        <FiTrash2 />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="empty-box">
                    <h3>No quizzes found</h3>
                </div>
            )}
        </div>
    );
};

export default MyQuizzes;
