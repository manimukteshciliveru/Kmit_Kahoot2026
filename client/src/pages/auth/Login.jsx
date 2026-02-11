import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { FiMail, FiLock, FiEye, FiEyeOff, FiArrowRight, FiSun, FiMoon } from 'react-icons/fi';
import toast from 'react-hot-toast';
import KmitLogo from '../../components/common/KmitLogo';
import './Auth.css';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!email || !password) {
            toast.error('Please fill in all fields');
            return;
        }

        setLoading(true);
        const result = await login(email, password);
        setLoading(false);

        if (result.success) {
            toast.success('Welcome back!');
            navigate('/dashboard');
        } else {
            toast.error(result.message);
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

                    <form onSubmit={handleSubmit} className="auth-form">
                        <div className="form-group">
                            <label className="form-label">Email Address</label>
                            <div className="input-wrapper">
                                <FiMail className="input-icon" />
                                <input
                                    type="email"
                                    className="form-input"
                                    placeholder="Enter your email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    autoComplete="email"
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

                        <div className="form-options">
                            <label className="checkbox-label">
                                <input type="checkbox" />
                                <span>Remember me</span>
                            </label>
                            <Link to="/forgot-password" className="forgot-link">
                                Forgot password?
                            </Link>
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

                    <div className="auth-footer">
                        <p>Don't have an account?</p>
                        <Link to="/register" className="auth-link">
                            Create Account
                        </Link>
                    </div>

                    <div className="demo-accounts">
                        <p className="demo-title">Demo Accounts</p>
                        <div className="demo-grid">
                            <button
                                className="demo-btn"
                                onClick={() => { setEmail('student@demo.com'); setPassword('demo123'); }}
                            >
                                Student
                            </button>
                            <button
                                className="demo-btn"
                                onClick={() => { setEmail('faculty@demo.com'); setPassword('demo123'); }}
                            >
                                Faculty
                            </button>
                            <button
                                className="demo-btn"
                                onClick={() => { setEmail('admin@demo.com'); setPassword('demo123'); }}
                            >
                                Admin
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
