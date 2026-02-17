import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import {
    FiHome,
    FiLogOut,
    FiUser,
    FiSettings,
    FiGrid,
    FiUsers,
    FiFileText,
    FiPlusCircle,
    FiActivity,
    FiSun,
    FiMoon
} from 'react-icons/fi';
import { useTheme } from '../../context/ThemeContext';
import KmitLogo from './KmitLogo';
import './Navbar.css';

const Navbar = () => {
    const { user, logout, isAuthenticated } = useAuth();
    const { connected } = useSocket();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const getNavLinks = () => {
        if (!isAuthenticated || !user) return [];

        switch (user.role) {
            case 'student':
                return [
                    { path: '/dashboard', icon: <FiHome />, label: 'Dashboard' },
                    { path: '/join-quiz', icon: <FiGrid />, label: 'Join Quiz' },
                    { path: '/history', icon: <FiFileText />, label: 'History' }
                ];
            case 'faculty':
                return [
                    { path: '/dashboard', icon: <FiHome />, label: 'Dashboard' },
                    { path: '/my-quizzes', icon: <FiGrid />, label: 'My Quizzes' },
                    { path: '/create-quiz', icon: <FiPlusCircle />, label: 'Create Quiz' }
                ];
            case 'admin':
                return [
                    { path: '/dashboard', icon: <FiHome />, label: 'Dashboard' },
                    { path: '/analytics', icon: <FiActivity />, label: 'Server Health' },
                    { path: '/quiz-analytics', icon: <FiGrid />, label: 'Quiz Metrics' },
                    { path: '/users', icon: <FiUsers />, label: 'Users' },
                    { path: '/settings', icon: <FiSettings />, label: 'Settings' }
                ];
            default:
                return [];
        }
    };

    const navLinks = getNavLinks();

    return (
        <nav className="navbar">
            <div className="navbar-container">
                <Link to="/" className="navbar-brand">
                    <div className="brand-logo-wrapper">
                        <KmitLogo height="36px" />
                    </div>
                </Link>

                {isAuthenticated && (
                    <>
                        <ul className="navbar-links">
                            {navLinks.map((link) => (
                                <li key={link.path}>
                                    <Link
                                        to={link.path}
                                        className={`nav-link ${location.pathname === link.path ? 'active' : ''}`}
                                    >
                                        {link.icon}
                                        <span>{link.label}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>

                        <div className="navbar-right">
                            <button onClick={toggleTheme} className="theme-btn" title="Toggle Theme">
                                {theme === 'dark' ? <FiSun /> : <FiMoon />}
                            </button>
                            <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
                                <span className="status-dot"></span>
                                <span className="status-text">{connected ? 'Live' : 'Offline'}</span>
                            </div>

                            <div className="user-menu">
                                <div className="user-info">
                                    <img
                                        src={user?.avatar || `https://ui-avatars.com/api/?name=${user?.name}&background=FF7F11&color=fff`}
                                        alt={user?.name}
                                        className="user-avatar"
                                    />
                                    <div className="user-details">
                                        <span className="user-name">{user?.name}</span>
                                        <span className="user-role">{user?.role}</span>
                                    </div>
                                </div>

                                <div className="user-dropdown">
                                    <Link to="/profile" className="dropdown-item">
                                        <FiUser />
                                        <span>Profile</span>
                                    </Link>
                                    <button onClick={handleLogout} className="dropdown-item logout">
                                        <FiLogOut />
                                        <span>Logout</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {!isAuthenticated && (
                    <div className="navbar-auth">
                        <button onClick={toggleTheme} className="theme-btn" title="Toggle Theme">
                            {theme === 'dark' ? <FiSun /> : <FiMoon />}
                        </button>
                        <Link to="/login" className="btn btn-primary">
                            Log In
                        </Link>
                    </div>
                )}
            </div>
        </nav>
    );
};

export default Navbar;
