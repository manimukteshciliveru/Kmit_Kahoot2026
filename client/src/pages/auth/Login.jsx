import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { FiUser, FiLock, FiEye, FiEyeOff, FiArrowRight, FiSun, FiMoon, FiInfo } from 'react-icons/fi';
import { HiAcademicCap, HiUserGroup, HiShieldCheck } from 'react-icons/hi2';
import toast from 'react-hot-toast';
import './Auth.css';

// Role definitions for login form
const ROLES = [
    { id: 'student', label: 'Student', icon: HiAcademicCap, placeholder: 'e.g. 22R11A0501', fieldLabel: 'Roll Number' },
    { id: 'faculty', label: 'Faculty', icon: HiUserGroup, placeholder: 'e.g. FAC10', fieldLabel: 'Faculty ID' },
    { id: 'admin', label: 'Admin', icon: HiShieldCheck, placeholder: 'e.g. ADMIN01', fieldLabel: 'Admin ID' },
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
                toast.success('Welcome back to the Arena!');
                navigate(`/${selectedRole}/dashboard`);
            } else {
                toast.error(result.message || 'Authentication failed');
            }
        } catch (err) {
            toast.error('Connection error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <canvas id="pCanvas" ref={canvasRef}></canvas>

            {/* Premium Decor: Gold Light Beams */}
            <div className="beam" style={{ left: '15%', bottom: 0, animationDelay: '0s' }}></div>
            <div className="beam" style={{ left: '30%', bottom: 0, animationDelay: '1.2s' }}></div>
            <div className="beam" style={{ left: '55%', bottom: 0, animationDelay: '2.1s' }}></div>
            <div className="beam" style={{ left: '72%', bottom: 0, animationDelay: '0.7s' }}></div>
            <div className="beam" style={{ left: '88%', bottom: 0, animationDelay: '1.8s' }}></div>

            {/* Floating Gold Rings */}
            <div className="gring" style={{ width: '560px', height: '560px', animation: 'spin1 20s linear infinite' }}></div>
            <div className="gring" style={{ width: '720px', height: '720px', animation: 'spin1 28s linear infinite reverse' }}></div>

            {/* Corner Theme Toggle */}
            <div className="theme-toggle-corner">
                <button onClick={toggleTheme} className="theme-selector-btn">
                    {theme === 'dark' ? <><FiMoon /> Night Mode</> : <><FiSun /> Day Mode</>}
                </button>
            </div>

            <div className="auth-container">
                {/* Corner Sparkles */}
                <div className="sparkle" style={{ top: '-12px', left: '-12px' }}></div>
                <div className="sparkle" style={{ top: '-12px', right: '-12px', transform: 'rotate(45deg)', animationDelay: '0.5s' }}></div>
                <div className="sparkle" style={{ bottom: '-12px', left: '-12px', transform: 'rotate(-45deg)', animationDelay: '1s' }}></div>
                <div className="sparkle" style={{ bottom: '-12px', right: '-12px', transform: 'rotate(90deg)', animationDelay: '1.5s' }}></div>

                <div className="card-outer">
                    <div className="card-inner">
                        {/* Gold Header */}
                        <div className="gold-header">
                            <h1>Welcome Back</h1>
                            <p>Sign in to continue your learning journey</p>
                            <div className="gold-chevron"></div>
                        </div>

                        {/* Role Selector Tabs */}
                        <div className="role-selector">
                            {ROLES.map((role) => {
                                const Icon = role.icon;
                                return (
                                    <button
                                        key={role.id}
                                        type="button"
                                        className={`role-btn ${selectedRole === role.id ? 'active' : ''}`}
                                        onClick={() => setSelectedRole(role.id)}
                                    >
                                        <Icon className="role-icon" />
                                        <span>{role.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Login Form */}
                        <form onSubmit={handleSubmit} className="auth-form">
                            <div className="form-group">
                                <label className="form-label">{currentRole.fieldLabel}</label>
                                <div className="input-wrapper">
                                    <FiUser />
                                    <input
                                        type="text"
                                        placeholder={currentRole.placeholder}
                                        value={userId}
                                        onChange={(e) => setUserId(e.target.value)}
                                        autoComplete="username"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Secret Password</label>
                                <div className="input-wrapper">
                                    <FiLock />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        autoComplete="current-password"
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle-btn"
                                        style={{ background: 'none', border: 'none', color: 'rgba(233,168,37,0.4)', cursor: 'pointer' }}
                                        onClick={() => setShowPassword(!showPassword)}
                                    >
                                        {showPassword ? <FiEyeOff /> : <FiEye />}
                                    </button>
                                </div>
                            </div>

                            <div style={{ textAlign: 'right', marginBottom: '1.5rem' }}>
                                <Link to="/forgot-password" style={{ color: 'rgba(233,168,37,0.5)', fontSize: '11px', textDecoration: 'none' }}>
                                    Lost your access?
                                </Link>
                            </div>

                            <button type="submit" className="signin-premium" disabled={loading}>
                                {loading ? (
                                    <span className="spinner-sm" style={{ border: '2px solid rgba(18,0,42,0.2)', borderTop: '2px solid #12002a', borderRadius: '50%', width: '18px', height: '18px', animation: 'spin 1s linear infinite' }}></span>
                                ) : (
                                    <>
                                        ENTER THE ARENA <FiArrowRight />
                                    </>
                                )}
                            </button>
                        </form>

                        <div style={{ padding: '0 2rem 1.5rem', borderTop: '1px solid rgba(233,168,37,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem' }}>
                           <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                             KMIT Sec-Protocol v2.0
                           </span>
                           <div style={{ display: 'flex', gap: '4px' }}>
                             {[0, 1, 2].map(i => (
                               <div key={i} style={{ width: i === ROLES.findIndex(r => r.id === selectedRole) ? '16px' : '6px', height: '6px', borderRadius: '4px', background: i === ROLES.findIndex(r => r.id === selectedRole) ? '#E9A825' : 'rgba(233,168,37,0.2)', transition: 'all 0.3s' }}></div>
                             ))}
                           </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};

export default Login;
