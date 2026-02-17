import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../services/api';
import {
    FiUser, FiMail, FiBook, FiLayout, FiLock,
    FiShield
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import './Profile.css';

const Profile = () => {
    const { user } = useAuth();

    // Password State
    const [passwords, setPasswords] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        if (passwords.newPassword !== passwords.confirmPassword) {
            return toast.error('Passwords do not match');
        }
        if (passwords.newPassword.length < 6) {
            return toast.error('Password must be at least 6 characters');
        }
        try {
            await authAPI.changePassword({
                currentPassword: passwords.currentPassword,
                newPassword: passwords.newPassword
            });
            toast.success('Password changed successfully');
            setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error) {
            toast.error(error.response?.data?.message || 'Password change failed');
        }
    };

    return (
        <div className="profile-container">
            <header className="profile-header">
                <div className="profile-avatar">
                    {user?.name?.charAt(0)}
                </div>
                <div className="profile-info-main">
                    <h1>{user?.name}</h1>
                    <div className="profile-badges">
                        <span className="profile-badge">
                            <FiShield /> {user?.role?.toUpperCase()}
                        </span>
                        {user?.role === 'student' && (
                            <>
                                <span className="profile-badge"><FiBook /> {user?.department || 'No Branch'}</span>
                                <span className="profile-badge"><FiLayout /> Section {user?.section || 'No Sec'}</span>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <main className="profile-content">
                <div className="profile-form-grid">
                    <div className="form-card">
                        <h3><FiUser /> User Details</h3>
                        <div className="profile-details-readonly">
                            <div className="form-group">
                                <label>Full Name</label>
                                <div className="input-wrapper">
                                    <FiUser />
                                    <input type="text" value={user?.name || ''} disabled />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Email Address</label>
                                <div className="input-wrapper">
                                    <FiMail />
                                    <input type="email" value={user?.email || ''} disabled />
                                </div>
                            </div>

                            {user?.role === 'student' && (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div className="form-group">
                                            <label>Roll Number</label>
                                            <input type="text" value={user?.rollNumber || 'N/A'} disabled style={{ fontWeight: 600 }} />
                                        </div>
                                        <div className="form-group">
                                            <label>Department</label>
                                            <input type="text" value={user?.department || 'N/A'} disabled style={{ fontWeight: 600 }} />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Section</label>
                                        <div className="input-wrapper">
                                            <FiLayout />
                                            <input type="text" value={user?.section || 'N/A'} disabled style={{ fontWeight: 600 }} />
                                        </div>
                                    </div>
                                </>
                            )}

                            {user?.role === 'faculty' && (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div className="form-group">
                                            <label>Employee ID</label>
                                            <input type="text" value={user?.employeeId || 'N/A'} disabled style={{ fontWeight: 600 }} />
                                        </div>
                                        <div className="form-group">
                                            <label>Designation</label>
                                            <input type="text" value={user?.designation || 'Faculty'} disabled style={{ fontWeight: 600 }} />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Subjects Handling</label>
                                        <div className="input-wrapper">
                                            <FiBook />
                                            <input type="text" value={user?.subjects || 'General'} disabled style={{ fontWeight: 600 }} />
                                        </div>
                                    </div>
                                </>
                            )}

                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1.5rem', fontStyle: 'italic', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                                Note: Academic and registration details are managed by the administrator. Please contact the office for any corrections.
                            </p>
                        </div>
                    </div>

                    <div className="form-card">
                        <h3><FiLock /> Change Password</h3>
                        <form onSubmit={handlePasswordChange}>
                            <div className="form-group">
                                <label>Current Password</label>
                                <div className="input-wrapper">
                                    <FiLock />
                                    <input
                                        type="password"
                                        value={passwords.currentPassword}
                                        onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                                        placeholder="Enter current password"
                                        required
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>New Password</label>
                                <div className="input-wrapper">
                                    <FiLock />
                                    <input
                                        type="password"
                                        value={passwords.newPassword}
                                        onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                                        placeholder="Min. 6 characters"
                                        required
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Confirm New Password</label>
                                <div className="input-wrapper">
                                    <FiLock />
                                    <input
                                        type="password"
                                        value={passwords.confirmPassword}
                                        onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                                        placeholder="Confirm new password"
                                        required
                                    />
                                </div>
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                                Update Password
                            </button>
                        </form>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Profile;
