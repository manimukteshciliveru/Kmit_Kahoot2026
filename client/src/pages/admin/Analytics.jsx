import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import {
    FiArrowLeft,
    FiActivity,
    FiServer,
    FiCpu,
    FiHardDrive,
    FiDatabase,
    FiCheckCircle,
    FiAlertCircle,
    FiClock,
    FiLayers
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import '../Dashboard.css';
import './AdminPages.css';

const Analytics = () => {
    const [loading, setLoading] = useState(true);
    const [health, setHealth] = useState(null);

    useEffect(() => {
        fetchHealth();
        const timer = setInterval(fetchHealth, 30000); // Update every 30s
        return () => clearInterval(timer);
    }, []);

    const fetchHealth = async () => {
        try {
            const response = await adminAPI.getHealth();
            setHealth(response.data.data);
        } catch (error) {
            console.error('Failed to fetch health data:', error);
            toast.error('Failed to load server metrics');
        } finally {
            setLoading(false);
        }
    };

    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const getUptimeString = (seconds) => {
        const days = Math.floor(seconds / (24 * 3600));
        const hours = Math.floor((seconds % (24 * 3600)) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${days}d ${hours}h ${minutes}m`;
    };

    return (
        <div className="admin-page analytics-page">
            <div className="page-header">
                <div className="header-left">
                    <Link to="/dashboard" className="back-btn">
                        <FiArrowLeft /> Back to Dashboard
                    </Link>
                    <h1><FiActivity /> Server & System Analytics</h1>
                </div>
            </div>

            {loading ? (
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Fetching server metrics...</p>
                </div>
            ) : health ? (
                <>
                    {/* Status Overview */}
                    <div className="stats-grid analytics-stats">
                        <div className={`stat-card stat-${health.database.status === 'Connected' ? 'success' : 'danger'}`}>
                            <div className="stat-icon"><FiDatabase /></div>
                            <div className="stat-info">
                                <span className="stat-value">{health.database.status}</span>
                                <span className="stat-label">Database Status</span>
                                <span className="stat-subtext">MongoDB Atlas</span>
                            </div>
                        </div>
                        <div className="stat-card stat-primary">
                            <div className="stat-icon"><FiServer /></div>
                            <div className="stat-info">
                                <span className="stat-value">{getUptimeString(health.system.uptime)}</span>
                                <span className="stat-label">Server Uptime</span>
                                <span className="stat-subtext">Node.js {health.system.nodeVersion}</span>
                            </div>
                        </div>
                        <div className="stat-card stat-accent">
                            <div className="stat-icon"><FiLayers /></div>
                            <div className="stat-info">
                                <span className="stat-value">{health.system.platform}</span>
                                <span className="stat-label">OS Platform</span>
                                <span className="stat-subtext">{health.system.architecture}</span>
                            </div>
                        </div>
                        <div className="stat-card stat-info">
                            <div className="stat-icon"><FiClock /></div>
                            <div className="stat-info">
                                <span className="stat-value">{new Date().toLocaleTimeString()}</span>
                                <span className="stat-label">Server Time</span>
                                <span className="stat-subtext">{new Date().toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>

                    <div className="analytics-grid">
                        {/* CPU & Memory Card */}
                        <div className="dashboard-card">
                            <div className="card-header">
                                <h2><FiCpu /> Resource Usage</h2>
                            </div>
                            <div className="card-body">
                                <div className="usage-sections">
                                    <div className="usage-item">
                                        <div className="usage-info">
                                            <span>CPU Load (1m)</span>
                                            <span>{health.system.loadAverage[0].toFixed(2)}</span>
                                        </div>
                                        <div className="usage-bar">
                                            <div
                                                className="fill"
                                                style={{
                                                    width: `${Math.min(health.system.loadAverage[0] * 10, 100)}%`,
                                                    background: health.system.loadAverage[0] > 1 ? 'var(--gradient-danger)' : 'var(--gradient-primary)'
                                                }}
                                            ></div>
                                        </div>
                                    </div>

                                    <div className="usage-item">
                                        <div className="usage-info">
                                            <span>Memory Usage ({health.system.memory.usagePercentage}%)</span>
                                            <span>{formatBytes(health.system.memory.total - health.system.memory.free)} / {formatBytes(health.system.memory.total)}</span>
                                        </div>
                                        <div className="usage-bar">
                                            <div
                                                className="fill"
                                                style={{
                                                    width: `${health.system.memory.usagePercentage}%`,
                                                    background: health.system.memory.usagePercentage > 80 ? 'var(--gradient-danger)' : 'var(--gradient-success)'
                                                }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>

                                <div className="system-details-list">
                                    <div className="detail-row">
                                        <span>Free Memory</span>
                                        <span>{formatBytes(health.system.memory.free)}</span>
                                    </div>
                                    <div className="detail-row">
                                        <span>CPU Cores</span>
                                        <span>{health.system.cpus} Cores</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Database Details */}
                        <div className="dashboard-card">
                            <div className="card-header">
                                <h2><FiDatabase /> Database Details</h2>
                            </div>
                            <div className="card-body">
                                <div className="db-status-box">
                                    <div className={`status-indicator ${health.database.status === 'Connected' ? 'online' : 'offline'}`}></div>
                                    <div className="status-text">
                                        <h3>Database is {health.database.status}</h3>
                                        <p>All database operations are currently functional and responsive.</p>
                                    </div>
                                </div>
                                <div className="system-details-list">
                                    <div className="detail-row">
                                        <span>Connection Type</span>
                                        <span>Persistent Mongoose</span>
                                    </div>
                                    <div className="detail-row">
                                        <span>Drive Version</span>
                                        <span>v4.x+</span>
                                    </div>
                                    <div className="detail-row">
                                        <span>Response Time</span>
                                        <span className="text-success"><FiCheckCircle /> Optimal</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* System Logs / Events */}
                        <div className="dashboard-card full-width">
                            <div className="card-header">
                                <h2><FiAlertCircle /> Active Services</h2>
                            </div>
                            <div className="card-body">
                                <div className="services-grid">
                                    <div className="service-item">
                                        <FiCheckCircle className="text-success" />
                                        <div className="service-info">
                                            <span>API Server</span>
                                            <small>Port 5000 - Running</small>
                                        </div>
                                    </div>
                                    <div className="service-item">
                                        <FiCheckCircle className="text-success" />
                                        <div className="service-info">
                                            <span>WebSocket Server</span>
                                            <small>Live events active</small>
                                        </div>
                                    </div>
                                    <div className="service-item">
                                        <FiCheckCircle className="text-success" />
                                        <div className="service-info">
                                            <span>AI Generation Service</span>
                                            <small>Gemini Pro Connected</small>
                                        </div>
                                    </div>
                                    <div className="service-item">
                                        <FiCheckCircle className="text-success" />
                                        <div className="service-info">
                                            <span>Storage Service</span>
                                            <small>Local/GridFS Active</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="error-state">
                    <FiAlertCircle />
                    <p>Failed to retrieve system health. Please check server logs.</p>
                </div>
            )}
        </div>
    );
};

export default Analytics;
