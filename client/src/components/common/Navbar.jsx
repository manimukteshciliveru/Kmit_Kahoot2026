import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import {
    FiHome, FiLogOut, FiUser, FiSettings, FiGrid, FiUsers,
    FiFileText, FiPlusCircle, FiActivity, FiSun, FiMoon,
    FiMenu, FiX, FiLayers, FiZap, FiTarget
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
    const [menuOpen, setMenuOpen] = useState(false);

    // Close mobile menu on route change
    useEffect(() => {
        setMenuOpen(false);
    }, [location.pathname]);

    // Close on outside click
    useEffect(() => {
        if (!menuOpen) return;
        const close = (e) => {
            if (!e.target.closest('.navbar')) setMenuOpen(false);
        };
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, [menuOpen]);

    const handleLogout = () => {
        logout();
        navigate('/login');
        setMenuOpen(false);
    };

    const getNavLinks = () => {
        if (!isAuthenticated || !user) return [];
        switch (user.role) {
            case 'student':
                return [
                    { path: '/student/dashboard', icon: <FiHome />,     label: 'Dashboard' },
                    { path: '/student/join',      icon: <FiGrid />,     label: 'Join Quiz' },
                    { path: '/student/games',     icon: <FiTarget />,   label: 'Game Hub' },
                    { path: '/student/history',   icon: <FiFileText />, label: 'History' }
                ];
            case 'faculty':
                return [
                    { path: '/faculty/dashboard', icon: <FiHome />,       label: 'Dashboard' },
                    { path: '/faculty/quizzes',   icon: <FiGrid />,       label: 'My Quizzes' },
                    { path: '/faculty/create',    icon: <FiPlusCircle />, label: 'Create Quiz' }
                ];
            case 'admin':
                return [
                    { path: '/admin/dashboard', icon: <FiHome />,     label: 'Dashboard' },
                    { path: '/admin/analytics', icon: <FiActivity />, label: 'Server Health' },
                    { path: '/admin/users',     icon: <FiUsers />,    label: 'Users' },
                    { path: '/admin/settings',  icon: <FiSettings />, label: 'Settings' }
                ];
            default:
                return [];
        }
    };

    const navLinks = getNavLinks();

    return (
        <nav className="navbar">
            <div className="navbar-container">
                {/* Brand */}
                <Link to={isAuthenticated ? `/${user.role}/dashboard` : "/"} className="navbar-brand">
                    <div className="brand-logo-wrapper">
                        <KmitLogo height="34px" />
                    </div>
                </Link>

                {/* Desktop Nav Links */}
                {isAuthenticated && (
                    <ul className="navbar-links desktop-only">
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
                )}

                {/* Right Section */}
                <div className="navbar-right">
                    {/* Theme Toggle */}
                    <button onClick={toggleTheme} className="theme-btn" title="Toggle Theme">
                        {theme === 'dark' ? <FiSun /> : <FiMoon />}
                    </button>

                    {isAuthenticated && (
                        <>
                            {/* Connection Status — desktop only */}
                            <div className={`connection-status desktop-only ${connected ? 'connected' : 'disconnected'}`}>
                                <span className="status-dot"></span>
                                <span className="status-text">{connected ? 'Live' : 'Offline'}</span>
                            </div>

                            {/* User Menu — desktop */}
                            <div className="user-menu desktop-only">
                                <div className="user-info">
                                    <img
                                        src={user?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'U')}&background=7B2FBE&color=fff`}
                                        alt={user?.name}
                                        className="user-avatar"
                                    />
                                    <div className="user-details">
                                        <span className="user-name">{user?.name}</span>
                                        <span className="user-role">{user?.role}</span>
                                    </div>
                                </div>
                                <div className="user-dropdown">
                                    <Link to={`/${user.role}/profile`} className="dropdown-item">
                                        <FiUser /><span>Profile</span>
                                    </Link>
                                    <button onClick={handleLogout} className="dropdown-item logout">
                                        <FiLogOut /><span>Logout</span>
                                    </button>
                                </div>
                            </div>

                            {/* Mobile Hamburger */}
                            <button
                                className="hamburger-btn mobile-only"
                                onClick={() => setMenuOpen(o => !o)}
                                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                            >
                                {menuOpen ? <FiX /> : <FiMenu />}
                            </button>
                        </>
                    )}

                    {!isAuthenticated && (
                        <Link to="/login" className="btn btn-primary btn-sm">Log In</Link>
                    )}
                </div>
            </div>

            {/* Mobile Slide-Down Menu */}
            {isAuthenticated && (
                <div className={`mobile-menu ${menuOpen ? 'open' : ''}`}>
                    {/* User info bar */}
                    <div className="mobile-user-bar">
                        <img
                            src={user?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'U')}&background=7B2FBE&color=fff`}
                            alt={user?.name}
                            className="user-avatar"
                        />
                        <div>
                            <div className="user-name">{user?.name}</div>
                            <div className="user-role">{user?.role}</div>
                        </div>
                        <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`} style={{ marginLeft: 'auto' }}>
                            <span className="status-dot"></span>
                            <span className="status-text">{connected ? 'Live' : 'Offline'}</span>
                        </div>
                    </div>

                    {/* Mobile Nav Links */}
                    <ul className="mobile-nav-links">
                        {navLinks.map((link) => (
                            <li key={link.path}>
                                <Link
                                    to={link.path}
                                    className={`mobile-nav-link ${location.pathname === link.path ? 'active' : ''}`}
                                    onClick={() => setMenuOpen(false)}
                                >
                                    {link.icon}
                                    <span>{link.label}</span>
                                </Link>
                            </li>
                        ))}
                        <li>
                            <Link
                                to={`/${user.role}/profile`}
                                className="mobile-nav-link"
                                onClick={() => setMenuOpen(false)}
                            >
                                <FiUser /><span>Profile</span>
                            </Link>
                        </li>
                        <li>
                            <button className="mobile-nav-link logout-mobile" onClick={handleLogout}>
                                <FiLogOut /><span>Logout</span>
                            </button>
                        </li>
                    </ul>
                </div>
            )}
        </nav>
    );
};

export default Navbar;
