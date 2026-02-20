import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { FiMail, FiLock, FiEye, FiEyeOff, FiUser, FiArrowRight, FiSun, FiMoon } from 'react-icons/fi';
import toast from 'react-hot-toast';
import KmitLogo from '../../components/common/KmitLogo';
import './Auth.css';

const Register = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [role, setRole] = useState('student');
    const [department, setDepartment] = useState('CSE');
    const [section, setSection] = useState('A');
    const [rollNumber, setRollNumber] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { register } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!name || !email || !password || !confirmPassword) {
            toast.error('Please fill in all fields');
            return;
        }

        if (role === 'student' && !rollNumber) {
            toast.error('Registration number is required');
            return;
        }

        if (password !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        if (password.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }

        setLoading(true);
        try {
            const registrationData = {
                name,
                email,
                password,
                role,
                department: role === 'student' ? department : undefined,
                section: role === 'student' ? section : undefined,
                rollNumber: role === 'student' ? rollNumber : undefined
            };
            const result = await register(name, email, password, role, registrationData);
            if (result.success) {
                toast.success('Account created successfully!');
                navigate('/dashboard');
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            toast.error('Registration failed');
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

            <div className="theme-toggle-corner">
                <button
                    onClick={toggleTheme}
                    className={`theme-selector-btn ${theme}`}
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
                        <h1>Create Account</h1>
                        <p>Join the ultimate quiz platform</p>
                    </div>

                    <form onSubmit={handleSubmit} className="auth-form">
                        <div className="form-group">
                            <label className="form-label">Full Name</label>
                            <div className="input-wrapper">
                                <FiUser className="input-icon" />
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Enter your full name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

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
                                    required
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">I am a</label>
                            <div className="role-selector">
                                <button
                                    type="button"
                                    className={`role-btn ${role === 'student' ? 'active' : ''}`}
                                    onClick={() => setRole('student')}
                                >
                                    <span className="role-icon">🎓</span>
                                    <span className="role-name">Student</span>
                                </button>
                                <button
                                    type="button"
                                    className={`role-btn ${role === 'faculty' ? 'active' : ''}`}
                                    onClick={() => setRole('faculty')}
                                >
                                    <span className="role-icon">👨‍🏫</span>
                                    <span className="role-name">Faculty</span>
                                </button>
                            </div>
                        </div>

                        {role === 'student' && (
                            <div className="animate-fadeIn">
                                <div className="form-group">
                                    <label className="form-label">Roll Number</label>
                                    <div className="input-wrapper">
                                        <FiUser className="input-icon" />
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="e.g., 24BD1A058J"
                                            value={rollNumber}
                                            onChange={(e) => setRollNumber(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div className="form-group">
                                        <label className="form-label">Branch</label>
                                        <select
                                            className="form-input"
                                            value={department}
                                            onChange={(e) => setDepartment(e.target.value)}
                                        >
                                            <option value="CSE">CSE</option>
                                            <option value="CSM">CSM (AI & ML)</option>
                                            <option value="CSD">CSD (Data Science)</option>
                                            <option value="IT">IT</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Section</label>
                                        <select
                                            className="form-input"
                                            value={section}
                                            onChange={(e) => setSection(e.target.value)}
                                        >
                                            {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map(s => (
                                                <option key={s} value={s}>{s}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label">Password</label>
                            <div className="input-wrapper">
                                <FiLock className="input-icon" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    className="form-input"
                                    placeholder="Create a password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
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

                        <div className="form-group">
                            <label className="form-label">Confirm Password</label>
                            <div className="input-wrapper">
                                <FiLock className="input-icon" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    className="form-input"
                                    placeholder="Confirm your password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                />
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
                                    Create Account
                                    <FiArrowRight />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="auth-footer">
                        <p>Already have an account?</p>
                        <Link to="/login" className="auth-link">
                            Sign In
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};


export default Register;
