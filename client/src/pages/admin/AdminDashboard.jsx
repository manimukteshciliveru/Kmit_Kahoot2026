import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { userAPI, adminAPI } from '../../services/api';
import {
    FiUsers,
    FiUserCheck,
    FiGrid,
    FiTrendingUp,
    FiArrowRight,
    FiActivity,
    FiSettings,
    FiUserPlus,
    FiDatabase,
    FiServer,
    FiDownload,
    FiUpload,
    FiCpu,
    FiHardDrive
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import '../Dashboard.css';

const AdminDashboard = () => {
    const { user } = useAuth();
    const [analytics, setAnalytics] = useState(null);
    const [systemHealth, setSystemHealth] = useState(null);
    const [loading, setLoading] = useState(true);
    const [restoring, setRestoring] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [analyticsRes, healthRes] = await Promise.allSettled([
                userAPI.getAnalytics(),
                adminAPI.getHealth()
            ]);

            if (analyticsRes.status === 'fulfilled') {
                setAnalytics(analyticsRes.value.data.data);
            }
            if (healthRes.status === 'fulfilled') {
                setSystemHealth(healthRes.value.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
            toast.error('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    const handleBackup = async () => {
        const toastId = toast.loading('Generating backup...');
        try {
            const response = await adminAPI.getBackup();
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `quizmaster_backup_${new Date().toISOString().slice(0, 10)}.json`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success('Backup downloaded successfully', { id: toastId });
        } catch (error) {
            console.error('Backup failed:', error);
            toast.error('Backup failed to generate', { id: toastId });
        }
    };

    const handleRestore = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!window.confirm('WARNING: This will overwrite existing users, quizzes, and responses based on the backup. Are you sure?')) {
            e.target.value = null;
            return;
        }

        setRestoring(true);
        const toastId = toast.loading('Restoring database...');

        const formData = new FormData();
        formData.append('backupFile', file);

        try {
            await adminAPI.restoreBackup(formData);
            toast.success('Database restored successfully', { id: toastId });
            fetchData(); // Refresh data
        } catch (error) {
            console.error('Restore failed:', error);
            toast.error('Restore failed: ' + (error.response?.data?.message || 'Unknown error'), { id: toastId });
        } finally {
            setRestoring(false);
            e.target.value = null;
        }
    };

    const stats = analytics ? [
        {
            icon: <FiUsers />,
            label: 'Total Users',
            value: analytics.users?.total || 0,
            subtext: `+${analytics.users?.monthlyNew || 0} this month`,
            color: 'primary'
        },
        {
            icon: <FiUserCheck />,
            label: 'Active Users',
            value: analytics.users?.active || 0,
            subtext: `${Math.round((analytics.users?.active / analytics.users?.total) * 100) || 0}% active`,
            color: 'success'
        },
        {
            icon: <FiGrid />,
            label: 'Total Quizzes',
            value: analytics.quizzes?.total || 0,
            subtext: `+${analytics.quizzes?.monthlyNew || 0} this month`,
            color: 'accent'
        },
        {
            icon: <FiTrendingUp />,
            label: 'Quiz Attempts',
            value: analytics.responses?.total || 0,
            subtext: `${analytics.responses?.completed || 0} completed`,
            color: 'info'
        }
    ] : [];

    return (
        <div className="dashboard">
            <div className="dashboard-header">
                <div className="welcome-section">
                    <h1>Admin Dashboard 🛡️</h1>
                    <p>Monitor platform health, activity, and manage system</p>
                </div>
                <div className="header-actions">
                    <button onClick={handleBackup} className="btn btn-outline-primary">
                        <FiDownload /> Backup Data
                    </button>
                    <div className="file-upload-btn btn btn-outline-secondary">
                        <label htmlFor="restore-upload" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                            <FiUpload /> {restoring ? 'Restoring...' : 'Restore Data'}
                        </label>
                        <input
                            id="restore-upload"
                            type="file"
                            accept=".json"
                            onChange={handleRestore}
                            disabled={restoring}
                            style={{ display: 'none' }}
                        />
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="loading-state full-page">
                    <div className="spinner"></div>
                    <p>Loading system data...</p>
                </div>
            ) : (
                <>
                    {/* System Health Section */}
                    {systemHealth && (
                        <div className="dashboard-card mb-4" style={{ marginBottom: '20px' }}>
                            <div className="card-header">
                                <h2><FiActivity /> System Health & Status</h2>
                                <span className={`badge badge-${systemHealth.database.status === 'Connected' ? 'success' : 'danger'}`}>
                                    <FiDatabase /> DB: {systemHealth.database.status}
                                </span>
                            </div>
                            <div className="card-body">
                                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                                    <div className="stat-card stat-info">
                                        <div className="stat-icon"><FiServer /></div>
                                        <div className="stat-info">
                                            <span className="stat-value">{(systemHealth.system.uptime / 3600).toFixed(1)}h</span>
                                            <span className="stat-label">System Uptime</span>
                                        </div>
                                    </div>
                                    <div className="stat-card stat-warning">
                                        <div className="stat-icon"><FiCpu /></div>
                                        <div className="stat-info">
                                            <span className="stat-value">{systemHealth.system.loadAverage[0].toFixed(2)}</span>
                                            <span className="stat-label">CPU Load (1m)</span>
                                        </div>
                                    </div>
                                    <div className="stat-card stat-primary">
                                        <div className="stat-icon"><FiHardDrive /></div>
                                        <div className="stat-info">
                                            <span className="stat-value">{systemHealth.system.memory.usagePercentage}%</span>
                                            <span className="stat-label">Memory Usage</span>
                                            <span className="stat-subtext">{(systemHealth.system.memory.free / 1024 / 1024 / 1024).toFixed(1)} GB Free</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

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
                                    <span className="stat-subtext">{stat.subtext}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="dashboard-row">
                        <div className="dashboard-card">
                            <div className="card-header">
                                <h2>User Distribution</h2>
                            </div>
                            <div className="card-body">
                                <div className="user-distribution">
                                    <div className="dist-item">
                                        <div className="dist-bar">
                                            <div
                                                className="dist-fill students"
                                                style={{ width: `${analytics?.users?.total ? (analytics.users.students / analytics.users.total) * 100 : 0}%` }}
                                            ></div>
                                        </div>
                                        <div className="dist-info">
                                            <span className="dist-label">Students</span>
                                            <span className="dist-value">{analytics?.users?.students || 0}</span>
                                        </div>
                                    </div>
                                    <div className="dist-item">
                                        <div className="dist-bar">
                                            <div
                                                className="dist-fill faculty"
                                                style={{ width: `${analytics?.users?.total ? (analytics.users.faculty / analytics.users.total) * 100 : 0}%` }}
                                            ></div>
                                        </div>
                                        <div className="dist-info">
                                            <span className="dist-label">Faculty</span>
                                            <span className="dist-value">{analytics?.users?.faculty || 0}</span>
                                        </div>
                                    </div>
                                    <div className="dist-item">
                                        <div className="dist-bar">
                                            <div
                                                className="dist-fill admins"
                                                style={{ width: `${analytics?.users?.total ? (analytics.users.admins / analytics.users.total) * 100 : 0}%` }}
                                            ></div>
                                        </div>
                                        <div className="dist-info">
                                            <span className="dist-label">Admins</span>
                                            <span className="dist-value">{analytics?.users?.admins || 0}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="dashboard-card">
                            <div className="card-header">
                                <h2>Recent Users</h2>
                                <Link to="/users" className="view-all">
                                    View All <FiArrowRight />
                                </Link>
                            </div>
                            <div className="card-body">
                                {analytics?.recent?.users?.length > 0 ? (
                                    <div className="recent-list">
                                        {analytics.recent.users.map((recentUser) => (
                                            <div key={recentUser._id} className="recent-item">
                                                <img
                                                    src={`https://ui-avatars.com/api/?name=${recentUser.name}&background=FF7F11&color=fff`}
                                                    alt={recentUser.name}
                                                    className="avatar"
                                                />
                                                <div className="recent-info">
                                                    <span className="recent-name">{recentUser.name}</span>
                                                    <span className="recent-meta">{recentUser.email}</span>
                                                </div>
                                                <span className={`badge badge-${recentUser.role === 'admin' ? 'danger' : recentUser.role === 'faculty' ? 'primary' : 'success'}`}>
                                                    {recentUser.role}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-muted">No recent users</p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="dashboard-card full-width quick-actions">
                        <div className="card-header">
                            <h2>Quick Actions</h2>
                        </div>
                        <div className="card-body">
                            <div className="action-grid admin-actions">
                                <Link to="/users/new" className="action-item">
                                    <div className="action-icon primary">
                                        <FiUserPlus />
                                    </div>
                                    <span>Add User</span>
                                </Link>
                                <Link to="/analytics" className="action-item">
                                    <div className="action-icon secondary">
                                        <FiActivity />
                                    </div>
                                    <span>Analytics</span>
                                </Link>
                                <Link to="/users" className="action-item">
                                    <div className="action-icon accent">
                                        <FiUsers />
                                    </div>
                                    <span>All Users</span>
                                </Link>
                                <Link to="/settings" className="action-item">
                                    <div className="action-icon info">
                                        <FiSettings />
                                    </div>
                                    <span>Settings</span>
                                </Link>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default AdminDashboard;
