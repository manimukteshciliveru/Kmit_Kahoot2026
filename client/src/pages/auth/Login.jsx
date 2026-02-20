import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { FiUser, FiLock, FiEye, FiEyeOff, FiArrowRight, FiSun, FiMoon } from 'react-icons/fi';
import { HiAcademicCap, HiUserGroup, HiShieldCheck } from 'react-icons/hi2';
import toast from 'react-hot-toast';
import KmitLogo from '../../components/common/KmitLogo';
import './Auth.css';

// Role definitions for login form
const ROLES = [
    { id: 'student', label: 'Student', icon: HiAcademicCap, placeholder: 'Enter Roll Number (e.g., 24BD1A058J)', fieldLabel: 'Roll Number' },
    { id: 'faculty', label: 'Faculty', icon: HiUserGroup, placeholder: 'Enter Faculty ID', fieldLabel: 'Faculty ID' },
    { id: 'admin', label: 'Admin', icon: HiShieldCheck, placeholder: 'Enter Admin ID', fieldLabel: 'Admin ID' },
];

const Login = () => {
    const [selectedRole, setSelectedRole] = useState('student');
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();

    const currentRole = ROLES.find(r => r.id === selectedRole);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!userId || !password) {
            toast.error('Please fill in all fields');
            return;
        }

        if (loading) return; // Prevent double submission

        setLoading(true);
        try {
            const result = await login(userId, password, selectedRole);
            if (result.success) {
                toast.success(`Welcome back!`);
                navigate('/dashboard');
            } else {
                toast.error(result.message);
            }
        } catch (err) {
            toast.error('Login failed, please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-background">
                <div className="bg-gradient"></div>
                <div className="bg-grid"></div>
                <div className="bg-glow glow-1"></div>
                <div className="bg-glow glow-2"></div>
            </div>

            {/* Theme Toggle in top right corner */}
            <div className="theme-toggle-corner">
                <button
                    onClick={toggleTheme}
                    className={`theme-selector-btn ${theme}`}
                    title={theme === 'dark' ? 'Switch to Day Mode' : 'Switch to Night Mode'}
                >
                    <span className="theme-icon">
                        {theme === 'dark' ? <FiMoon /> : <FiSun />}
                    </span>
                    <span className="theme-label">
                        {theme === 'dark' ? 'Night Mode' : 'Day Mode'}
                    </span>
                </button>
            </div>

            <div className="auth-container">
                <div className="auth-card animate-slideUp">
                    <div className="auth-header">
                        <Link to="/" className="auth-logo">
                            <div style={{
                                display: 'inline-flex',
                                padding: '12px 24px',
                                background: 'white',
                                borderRadius: '12px',
                                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                marginBottom: '1rem',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <KmitLogo height="60px" />
                            </div>
                        </Link>
                        <h1>Welcome Back</h1>
                        <p>Sign in to continue your learning journey</p>
                    </div>

                    {/* Role Selector */}
                    <div className="role-selector">
                        {ROLES.map(role => {
                            const Icon = role.icon;
                            return (
                                <button
                                    key={role.id}
                                    type="button"
                                    className={`role-btn ${selectedRole === role.id ? 'active' : ''}`}
                                    onClick={() => {
                                        setSelectedRole(role.id);
                                        setUserId('');
                                        setPassword('');
                                    }}
                                >
                                    <Icon className="role-icon" />
                                    <span>{role.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    <form onSubmit={handleSubmit} className="auth-form">
                        <div className="form-group">
                            <label className="form-label">
                                {currentRole.fieldLabel}
                            </label>
                            <div className="input-wrapper">
                                <FiUser className="input-icon" />
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder={currentRole.placeholder}
                                    value={userId}
                                    onChange={(e) => setUserId(e.target.value)}
                                    autoComplete="username"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Password</label>
                            <div className="input-wrapper">
                                <FiLock className="input-icon" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    className="form-input"
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <FiEyeOff /> : <FiEye />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary btn-lg w-full"
                            disabled={loading}
                        >
                            {loading ? (
                                <span className="spinner spinner-sm"></span>
                            ) : (
                                <>
                                    Sign In
                                    <FiArrowRight />
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Login;
