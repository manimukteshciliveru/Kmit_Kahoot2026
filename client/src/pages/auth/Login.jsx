import { useState, useEffect, useRef } from 'react';
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
    const { login, isAuthenticated, user: authUser } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const canvasRef = useRef(null);

    // 🚀 Auto-redirect if already logged in
    useEffect(() => {
        if (isAuthenticated && authUser) {
            navigate(`/${authUser.role}/dashboard`);
        }
    }, [isAuthenticated, authUser, navigate]);

    // --- Particle System Logic ---
    useEffect(() => {
        const cv = canvasRef.current;
        if (!cv) return;
        const ctx = cv.getContext('2d');
        let animationFrameId;

        const resize = () => {
            cv.width = window.innerWidth;
            cv.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        const N = 60;
        const pts = Array.from({ length: N }, () => ({
            x: Math.random() * cv.width,
            y: Math.random() * cv.height,
            r: Math.random() * 1.8 + 0.4,
            vx: (Math.random() - 0.5) * 0.35,
            vy: (Math.random() - 0.5) * 0.35,
            a: Math.random(),
            gold: Math.random() > 0.45
        }));

        const frame = () => {
            ctx.clearRect(0, 0, cv.width, cv.height);
            pts.forEach(p => {
                p.x += p.vx; p.y += p.vy;
                if (p.x < 0 || p.x > cv.width) p.vx *= -1;
                if (p.y < 0 || p.y > cv.height) p.vy *= -1;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = p.gold ? `rgba(233,168,37,${p.a * 0.8})` : `rgba(180,120,255,${p.a * 0.4})`;
                ctx.fill();
            });

            for (let i = 0; i < N; i++) {
                for (let j = i + 1; j < N; j++) {
                    const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    if (d < 110) {
                        ctx.beginPath();
                        ctx.moveTo(pts[i].x, pts[i].y);
                        ctx.lineTo(pts[j].x, pts[j].y);
                        const a = (1 - d / 110) * 0.18;
                        ctx.strokeStyle = `rgba(233,168,37,${a})`;
                        ctx.lineWidth = 0.6;
                        ctx.stroke();
                    }
                }
            }
            animationFrameId = requestAnimationFrame(frame);
        };
        frame();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

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
                toast.success('Welcome back!');
                navigate(`/${selectedRole}/dashboard`);
            } else {
                toast.error(result.message || 'Login failed');
            }
        } catch (err) {
            toast.error('Connection error.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <canvas id="pCanvas" ref={canvasRef}></canvas>

            {/* Gold Beams */}
            <div className="beam" style={{ left: '15%', bottom: 0, animationDelay: '0s' }}></div>
            <div className="beam" style={{ left: '30%', bottom: 0, animationDelay: '1.2s' }}></div>
            <div className="beam" style={{ left: '55%', bottom: 0, animationDelay: '2.1s' }}></div>
            <div className="beam" style={{ left: '72%', bottom: 0, animationDelay: '0.7s' }}></div>
            <div className="beam" style={{ left: '88%', bottom: 0, animationDelay: '1.8s' }}></div>

            {/* Floating Gold Rings */}
            <div className="gring" style={{ width: '560px', height: '560px', animation: 'spin1 20s linear infinite' }}></div>
            <div className="gring" style={{ width: '720px', height: '720px', animation: 'spin1 28s linear infinite reverse' }}></div>

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
                {/* ── CARD MARKED PART REVERTED ── */}
                <div className="auth-card animate-slideUp">
                    <div className="auth-header">
                        <Link to="/" className="auth-logo">
                            <div className="logo-box">
                                <KmitLogo height="60px" />
                            </div>
                        </Link>
                        <h1>Welcome Back</h1>
                        <p>Sign in to continue your learning journey</p>
                    </div>

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
                            <label className="form-label">{currentRole.fieldLabel}</label>
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
