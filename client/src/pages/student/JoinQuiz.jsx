import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { quizAPI } from '../../services/api';
import { FiHash, FiArrowRight, FiPlay } from 'react-icons/fi';
import toast from 'react-hot-toast';
import './JoinQuiz.css';

const JoinQuiz = () => {
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!code.trim() || code.length < 6) {
            toast.error('Please enter a valid 6-character code');
            return;
        }

        setLoading(true);
        try {
            const response = await quizAPI.join(code.toUpperCase());
            toast.success('Joined quiz successfully!');
            navigate(`/quiz/${response.data.data.quiz._id}/play`);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to join quiz');
        } finally {
            setLoading(false);
        }
    };

    const handleCodeChange = (e) => {
        const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        setCode(value);
    };

    return (
        <div className="join-quiz-page">
            <div className="join-background">
                <div className="bg-gradient"></div>
                <div className="bg-grid"></div>
                <div className="floating-shapes">
                    <div className="shape shape-1">?</div>
                    <div className="shape shape-2">✓</div>
                    <div className="shape shape-3">★</div>
                    <div className="shape shape-4">🎓</div>
                    <div className="shape shape-5">💡</div>
                </div>
            </div>

            <div className="join-container">
                <div className="join-card animate-slideUp">
                    <div className="join-header">
                        <div className="join-icon">
                            <FiPlay />
                        </div>
                        <h1>Join a Quiz</h1>
                        <p>Enter the quiz code provided by your instructor</p>
                    </div>

                    <form onSubmit={handleSubmit} className="join-form">
                        <div className="code-input-wrapper">
                            <FiHash className="code-icon" />
                            <input
                                type="text"
                                className="code-input"
                                placeholder="ENTER CODE"
                                value={code}
                                onChange={handleCodeChange}
                                maxLength={6}
                                autoFocus
                            />
                            <div className="code-underline">
                                {[...Array(6)].map((_, i) => (
                                    <span key={i} className={`underline-segment ${code[i] ? 'filled' : ''}`}>
                                        {code[i] || ''}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary btn-lg w-full join-btn"
                            disabled={loading || code.length < 6}
                        >
                            {loading ? (
                                <span className="spinner spinner-sm"></span>
                            ) : (
                                <>
                                    Join Quiz
                                    <FiArrowRight />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="join-tips">
                        <h3>💡 Tips</h3>
                        <ul>
                            <li>Make sure you have a stable internet connection</li>
                            <li>Don't switch tabs during the quiz</li>
                            <li>Answer quickly for bonus points!</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default JoinQuiz;
