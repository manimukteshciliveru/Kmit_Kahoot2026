import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import {
    FiArrowLeft,
    FiSettings,
    FiDatabase,
    FiDownload,
    FiUpload,
    FiShield,
    FiInfo,
    FiServer
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import '../Dashboard.css';
import './AdminPages.css';

const Settings = () => {
    const [restoring, setRestoring] = useState(false);

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
            window.URL.revokeObjectURL(url);
            toast.success('Backup downloaded successfully', { id: toastId });
        } catch (error) {
            console.error('Backup failed:', error);
            toast.error('Backup failed to generate', { id: toastId });
        }
    };

    const handleRestore = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!window.confirm('WARNING: This will merge backup data with existing database. Are you sure you want to proceed?')) {
            e.target.value = null;
            return;
        }

        setRestoring(true);
        const toastId = toast.loading('Restoring database...');

        const formData = new FormData();
        formData.append('backupFile', file);

        try {
            const response = await adminAPI.restoreBackup(formData);
            toast.success(`Restored: ${response.data.details?.usersRestored || 0} users, ${response.data.details?.quizzesRestored || 0} quizzes`, { id: toastId });
        } catch (error) {
            console.error('Restore failed:', error);
            toast.error('Restore failed: ' + (error.response?.data?.message || 'Unknown error'), { id: toastId });
        } finally {
            setRestoring(false);
            e.target.value = null;
        }
    };

    return (
        <div className="admin-page settings-page">
            <div className="page-header">
                <div className="header-left">
                    <Link to="/dashboard" className="back-btn">
                        <FiArrowLeft /> Back
                    </Link>
                    <h1><FiSettings /> Platform Settings</h1>
                </div>
            </div>

            <div className="settings-grid">
                {/* Database Management */}
                <div className="settings-card">
                    <div className="card-header">
                        <FiDatabase />
                        <h2>Database Management</h2>
                    </div>
                    <div className="card-body">
                        <p className="setting-description">
                            Export your entire database or restore from a previous backup.
                        </p>
                        <div className="setting-actions">
                            <button onClick={handleBackup} className="btn btn-primary">
                                <FiDownload /> Download Backup
                            </button>
                            <label className="btn btn-secondary" style={{ cursor: restoring ? 'not-allowed' : 'pointer' }}>
                                <FiUpload /> {restoring ? 'Restoring...' : 'Restore from File'}
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={handleRestore}
                                    disabled={restoring}
                                    style={{ display: 'none' }}
                                />
                            </label>
                        </div>
                        <small className="hint">
                            ⚠️ Restore will merge backup data with existing records (upsert by ID).
                        </small>
                    </div>
                </div>

                {/* Security Settings (Placeholder) */}
                <div className="settings-card">
                    <div className="card-header">
                        <FiShield />
                        <h2>Security</h2>
                    </div>
                    <div className="card-body">
                        <div className="setting-item">
                            <div className="setting-info">
                                <span className="setting-label">Session Timeout</span>
                                <span className="setting-value">24 hours</span>
                            </div>
                        </div>
                        <div className="setting-item">
                            <div className="setting-info">
                                <span className="setting-label">Password Policy</span>
                                <span className="setting-value">Minimum 6 characters</span>
                            </div>
                        </div>
                        <div className="setting-item">
                            <div className="setting-info">
                                <span className="setting-label">Rate Limiting</span>
                                <span className="setting-value">1000 requests / 15 min</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Server Info */}
                <div className="settings-card">
                    <div className="card-header">
                        <FiServer />
                        <h2>Server Information</h2>
                    </div>
                    <div className="card-body">
                        <div className="setting-item">
                            <div className="setting-info">
                                <span className="setting-label">API URL</span>
                                <span className="setting-value">{import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'}</span>
                            </div>
                        </div>
                        <div className="setting-item">
                            <div className="setting-info">
                                <span className="setting-label">Environment</span>
                                <span className="setting-value">{import.meta.env.MODE || 'development'}</span>
                            </div>
                        </div>
                        <div className="setting-item">
                            <div className="setting-info">
                                <span className="setting-label">Version</span>
                                <span className="setting-value">QuizMaster Pro v1.0.0</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* About */}
                <div className="settings-card">
                    <div className="card-header">
                        <FiInfo />
                        <h2>About</h2>
                    </div>
                    <div className="card-body">
                        <p className="about-text">
                            <strong>QuizMaster Pro</strong> is a real-time quiz platform for educational institutions.
                            It supports live quizzes, AI-powered question generation from text, audio, and video files.
                        </p>
                        <p className="about-text">
                            Built with React, Node.js, MongoDB, and Socket.io.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
