import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { 
    FiLock, FiEye, FiEyeOff, FiArrowRight, 
    FiSun, FiMoon, FiMail, FiHash 
} from 'react-icons/fi';
import { FaUserGraduate, FaChalkboardTeacher, FaUserShield } from 'react-icons/fa';
import toast from 'react-hot-toast';
import KmitLogo from '../../components/common/KmitLogo';
import './Auth.css';

const ROLES = [
    { 
        id: 'student', 
        label: 'Student', 
        icon: <FaUserGraduate />, 
        placeholder: 'Roll Number or Email', 
        fieldLabel: 'Identity',
        desc: 'Access your quizzes and track performance'
    },
    { 
        id: 'faculty', 
        label: 'Faculty', 
        icon: <FaChalkboardTeacher />, 
        placeholder: 'Faculty ID or Email', 
        fieldLabel: 'Workplace ID',
        desc: 'Create, manage and analyze student quizzes'
    },
    { 
        id: 'admin', 
        label: 'Admin', 
        icon: <FaUserShield />, 
        placeholder: 'Admin ID or Email', 
        fieldLabel: 'System Key',
        desc: 'Overwatch system logs and user authority'
    },
];

const Login = () => {
    const [selectedRole, setSelectedRole] = useState('student');
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    
    const { login, isAuthenticated, user: authUser } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();

    // Auto-redirect if already logged in
    useEffect(() => {
        if (isAuthenticated && authUser) {
            navigate(`/${authUser.role}/dashboard`);
        }
    }, [isAuthenticated, authUser, navigate]);

    const currentRole = ROLES.find(r => r.id === selectedRole);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!userId || !password) {
            toast.error('Please fill in all fields');
            return;
        }
        setLoading(true);
        try {
            const result = await login(userId, password, selectedRole);
            if (result.success) {
                toast.success(`Welcome back, ${result.user.name.split(' ')[0]}!`);
                navigate(`/${selectedRole}/dashboard`);
            } else {
                toast.error(result.message);
            }
        } catch (err) {
            toast.error('Connection failed, try again later.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-v2-page">
            {/* Left Sidebar */}
            <aside className="login-sidebar">
                <div className="sidebar-brand">
                    <div className="logo-box">
                        <KmitLogo height="44px" />
                    </div>
                    <div className="brand-text">
                        <span>Kahoot!</span>
                        <small>Learning Engine</small>
                    </div>
                </div>

                <nav className="role-vertical-menu">
                    <div className="menu-label">SELECT AUTHORITY</div>
                    {ROLES.map(role => (
                        <button
                            key={role.id}
                            className={`role-item-btn ${selectedRole === role.id ? 'active' : ''}`}
                            onClick={() => {
                                setSelectedRole(role.id);
                                setUserId('');
                                setPassword('');
                            }}
                        >
                            <span className="role-item-icon">{role.icon}</span>
                            <div className="role-item-text">
                                <span className="label">{role.label}</span>
                                <span className="desc">{role.id === selectedRole ? 'Active Authority' : 'Switch Mode'}</span>
                            </div>
                            {selectedRole === role.id && <div className="active-indicator" />}
                        </button>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <button onClick={toggleTheme} className="theme-toggle-inline">
                        {theme === 'dark' ? <FiSun /> : <FiMoon />}
                        <span>{theme === 'dark' ? 'Day Mode' : 'Night Mode'}</span>
                    </button>
                    <div className="copyright">© 2026 KMIT-KAHOOT</div>
                </div>
            </aside>

            {/* Main Login Area */}
            <main className="login-main-content">
                <div className="login-background-fx">
                    <div className="blob blob-1"></div>
                    <div className="blob blob-2"></div>
                </div>

                <div className="login-form-container animate-slideRight">
                    <header className="form-header">
                        <div className="role-badge">
                            {currentRole.icon}
                            <span>{currentRole.label} PORTAL</span>
                        </div>
                        <h1>Login to your account</h1>
                        <p>{currentRole.desc}</p>
                    </header>

                    <form onSubmit={handleSubmit} className="login-form-body">
                        <div className="v2-form-group">
                            <label>{currentRole.fieldLabel}</label>
                            <div className="v2-input-wrapper">
                                <FiHash className="v2-icon" />
                                <input
                                    type="text"
                                    placeholder={currentRole.placeholder}
                                    value={userId}
                                    onChange={(e) => setUserId(e.target.value)}
                                    autoComplete="username"
                                />
                            </div>
                        </div>

                        <div className="v2-form-group">
                            <label>Password</label>
                            <div className="v2-input-wrapper">
                                <FiLock className="v2-icon" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="Enter secure password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    className="v2-toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <FiEyeOff /> : <FiEye />}
                                </button>
                            </div>
                        </div>

                        <div className="form-utils">
                            <label className="checkbox-container">
                                <input type="checkbox" />
                                <span className="checkmark"></span>
                                Remember me
                            </label>
                            <span className="forgot-link">Forgot Password?</span>
                        </div>

                        <button 
                            type="submit" 
                            className="v2-submit-btn" 
                            disabled={loading}
                        >
                            {loading ? (
                                <div className="v2-loader"></div>
                            ) : (
                                <>
                                    <span>Sign in to Dashboard</span>
                                    <FiArrowRight />
                                </>
                            )}
                        </button>
                    </form>

                    <footer className="form-footer">
                        <p>Need support? <span className="contact-support">Contact IT Desk</span></p>
                    </footer>
                </div>
            </main>
        </div>
    );
};

export default Login;
