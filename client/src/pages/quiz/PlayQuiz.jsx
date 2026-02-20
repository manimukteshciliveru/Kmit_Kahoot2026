import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { quizAPI, responseAPI, aiAPI } from '../../services/api';
import {
    FiClock,
    FiCheckCircle,
    FiXCircle,
    FiAward,
    FiUsers,
    FiTrendingUp,
    FiAlertTriangle,
    FiArrowLeft,
    FiZap,
    FiCpu
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import './PlayQuiz.css';

const CircularTimer = ({ timeLeft, totalTime, size = 60 }) => {
    const radius = size * 0.4;
    const circumference = 2 * Math.PI * radius;
    const progress = totalTime > 0 ? timeLeft / totalTime : 0;
    const offset = circumference - progress * circumference;

    const color = timeLeft <= 5 ? 'var(--danger)' : timeLeft <= 10 ? 'var(--warning)' : 'var(--primary)';

    return (
        <div className="circular-timer-container" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle
                    className="timer-bg"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="var(--bg-tertiary)"
                    strokeWidth="4"
                    fill="none"
                />
                <circle
                    className="timer-progress"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={color}
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                    style={{
                        strokeDasharray: circumference,
                        strokeDashoffset: isNaN(offset) ? 0 : offset,
                        transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease'
                    }}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </svg>
            <div className="timer-text" style={{ color }}>{timeLeft}</div>
        </div>
    );
};

const PlayQuiz = () => {
    const { quizId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { socket, joinQuiz, leaveQuiz, submitAnswer, completeQuiz, reportTabSwitch, on, off } = useSocket();

    // Quiz State
    const [quiz, setQuiz] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [status, setStatus] = useState('waiting'); // waiting, active, completed
    const [loading, setLoading] = useState(true);
    const [connectionError, setConnectionError] = useState(false);

    // Answer State
    const [selectedAnswer, setSelectedAnswer] = useState('');
    const [textAnswer, setTextAnswer] = useState('');
    const [isAnswered, setIsAnswered] = useState(false);
    const [feedback, setFeedback] = useState(null);
    const [savedAnswers, setSavedAnswers] = useState({}); // { questionId: answer }

    // Timer State
    const [overallTimeLeft, setOverallTimeLeft] = useState(0); // Global quiz timer
    const [timeLeft, setTimeLeft] = useState(0); // Per-question timer
    const timerRef = useRef(null);
    const globalTimerRef = useRef(null);

    // Score State
    const [score, setScore] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);

    // Leaderboard State
    const [leaderboard, setLeaderboard] = useState([]);
    const [showLeaderboard, setShowLeaderboard] = useState(false);

    // Tab Switch State (Cheating Detection)
    const [tabSwitchCount, setTabSwitchCount] = useState(0);
    const [showTabWarning, setShowTabWarning] = useState(false);

    // Review State
    const [reviewMode, setReviewMode] = useState(false);
    const [reviewData, setReviewData] = useState(null);

    // Question Panel State
    const [showQuestionPanel, setShowQuestionPanel] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [explainingQId, setExplainingQId] = useState(null);
    const [explanations, setExplanations] = useState({}); // { questionId: explanation }

    const handleAnswerSubmit = useCallback(async (isTimeout = false, answerOverride = null) => {
        if (status !== 'active') return;

        const currentQuestion = questions[currentIndex];
        const isMcqLike = currentQuestion?.type === 'mcq' || currentQuestion?.type === 'msq';

        // Use override if provided (for immediate auto-save), otherwise state
        const answer = answerOverride !== null ? answerOverride : (isMcqLike ? selectedAnswer : textAnswer);

        // Silent return if empty and not timeout - just don't submit empty unless forced
        if (!answer && !isTimeout) {
            return;
        }

        // Persist locally
        setSavedAnswers(prev => ({ ...prev, [currentQuestion?._id]: answer || '' }));
        setIsAnswered(true);

        try {
            const timeLimit = quiz?.settings?.questionTimer || 0;
            const timeTaken = timeLimit > 0 ? (timeLimit - timeLeft) * 1000 : 0;

            submitAnswer({
                quizId,
                questionId: currentQuestion?._id,
                answer: answer || '',
                timeTaken: timeTaken
            });
        } catch (error) {
            console.error('Failed to submit answer:', error);
        }
    }, [status, questions, currentIndex, selectedAnswer, textAnswer, timeLeft, submitAnswer, quizId, quiz]);

    // Handle jump to specific question
    const goToQuestion = (index) => {
        if (index === currentIndex) return;

        setCurrentIndex(index);
        const nextQ = questions[index];
        const savedAns = savedAnswers[nextQ?._id];

        if (savedAns) {
            setSelectedAnswer(savedAns);
            setTextAnswer(savedAns);
            setIsAnswered(true);
        } else {
            setSelectedAnswer('');
            setTextAnswer('');
            setIsAnswered(false);
        }
        setFeedback(null);
        setShowQuestionPanel(false); // Close panel on selection
    };

    // Handle Option Click for MCQ
    // Handle Option Click for MCQ with Auto-Save
    const handleOptionSelect = (option) => {
        const q = questions[currentIndex];
        let newAnswer = option;

        if (q?.type === 'mcq') {
            setSelectedAnswer(option);
        } else if (q?.type === 'msq') {
            const current = selectedAnswer.split(',').filter(Boolean);
            let next;
            if (current.includes(option)) {
                next = current.filter(a => a !== option);
            } else {
                next = [...current, option];
            }
            newAnswer = next.join(',');
            setSelectedAnswer(newAnswer);
        }

        // Trigger auto-save immediately with the new value
        handleAnswerSubmit(false, newAnswer);
    };

    const handleSubmitQuiz = useCallback(async (force = false) => {
        if (isSubmitting) return;

        const answeredCount = Object.keys(savedAnswers).length;
        const total = questions.length;

        if (!force) {
            if (answeredCount < total) {
                if (!window.confirm(`You have only answered ${answeredCount} out of ${total} questions. Submit anyway?`)) {
                    return;
                }
            } else {
                if (!window.confirm("Are you sure you want to submit your quiz?")) {
                    return;
                }
            }
        }

        try {
            setIsSubmitting(true);
            const promise = new Promise((resolve, reject) => {
                if (completeQuiz) {
                    completeQuiz(quizId);
                    resolve();
                } else if (socket) {
                    socket.emit('quiz:complete', { quizId });
                    resolve();
                } else {
                    reject(new Error("No connection to server"));
                }
            });

            await toast.promise(promise, {
                loading: 'Submitting quiz...',
                success: 'Quiz submitted successfully!',
                error: 'Submission in progress...' // Sometimes socket doesn't ack immediately, so we don't error hard
            });

            setStatus('completed'); // Optimistic update
            localStorage.removeItem(`quiz_${quizId}_answers`);
        } catch (error) {
            console.error('Submit Quiz Error:', error);
            toast.error("Failed to submit quiz. Please try again.");
            setIsSubmitting(false);
        }
    }, [savedAnswers, questions, completeQuiz, socket, quizId, isSubmitting]);

    // Persistence: Load from LocalStorage
    useEffect(() => {
        const saved = localStorage.getItem(`quiz_${quizId}_answers`);
        if (saved) {
            setSavedAnswers(JSON.parse(saved));
        }
    }, [quizId]);

    // Persistence: Save to LocalStorage
    useEffect(() => {
        if (Object.keys(savedAnswers).length > 0) {
            localStorage.setItem(`quiz_${quizId}_answers`, JSON.stringify(savedAnswers));
        }
    }, [savedAnswers, quizId]);

    const handleViewReview = async () => {
        try {
            setLoading(true);
            const response = await responseAPI.getMyResponse(quizId);
            setReviewData(response.data.data.response);
            setReviewMode(true);
        } catch (error) {
            console.error('Failed to load review:', error);
            toast.error('Failed to load review');
        } finally {
            setLoading(false);
        }
    };

    const handleAIExplain = async (q, userAnswer, correctAnswer) => {
        if (!q || explanations[q._id]) return;

        try {
            setExplainingQId(q._id);
            const response = await aiAPI.explainQuestion({
                question: q.text,
                userAnswer: userAnswer || 'Skipped',
                correctAnswer: correctAnswer
            });

            setExplanations(prev => ({
                ...prev,
                [q._id]: response.data.data.explanation
            }));
            toast.success('AI Review generated!');
        } catch (error) {
            console.error('AI Explanation Error:', error);
            toast.error('Failed to get AI review');
        } finally {
            setExplainingQId(null);
        }
    };

    // Fetch quiz data
    useEffect(() => {
        const fetchQuiz = async () => {
            try {
                const response = await quizAPI.getById(quizId);
                const quizData = response.data.data.quiz;
                setQuiz(quizData);
                setQuestions(quizData.questions || []);

                const isFinished = quizData.status === 'completed' || quizData.status === 'finished';
                setStatus(quizData.status === 'active' ? 'active' : isFinished ? 'finished' : 'waiting');

                if (isFinished) {
                    try {
                        const lbRes = await quizAPI.getLeaderboard(quizId);
                        setLeaderboard(lbRes.data.data.leaderboard || []);
                    } catch (err) {
                        console.error('Failed to fetch leaderboard:', err);
                    }
                }

                if (quizData.status === 'active') {
                    setCurrentIndex(quizData.currentQuestionIndex >= 0 ? quizData.currentQuestionIndex : 0);

                    // Initialize Overall Timer using expiresAt STRICTLY
                    if (quizData.expiresAt) {
                        const expires = new Date(quizData.expiresAt).getTime();
                        const now = Date.now();
                        const remaining = Math.max(0, Math.floor((expires - now) / 1000));
                        setOverallTimeLeft(remaining);
                        // If already expired
                        if (remaining <= 0) {
                            handleSubmitQuiz(true);
                        }
                    } else if (quizData.settings?.quizTimer > 0 && quizData.startedAt) {
                        // Fallback but prioritize expiresAt if available
                        const start = new Date(quizData.startedAt).getTime();
                        const now = Date.now();
                        const elapsed = Math.floor((now - start) / 1000);
                        const remaining = Math.max(0, quizData.settings.quizTimer - elapsed);
                        setOverallTimeLeft(remaining);
                    }

                    // RESUME LOGIC: Fetch existing response data
                    try {
                        const respRes = await responseAPI.getMyResponse(quizId);
                        const responseData = respRes.data.data.response;

                        if (responseData) {
                            setScore(responseData.totalScore || 0);
                            setCorrectCount(responseData.correctCount || 0);

                            const existingAnswers = {};
                            responseData.answers.forEach(ans => {
                                if (ans.answer) {
                                    existingAnswers[ans.questionId] = ans.answer;
                                }
                            });

                            setSavedAnswers(prev => ({ ...prev, ...existingAnswers }));

                            const currentQId = quizData.questions[quizData.currentQuestionIndex]?._id;
                            if (existingAnswers[currentQId]) {
                                setSelectedAnswer(existingAnswers[currentQId]);
                                setTextAnswer(existingAnswers[currentQId]);
                                setIsAnswered(true);
                            }
                        }
                    } catch (err) {
                        console.warn('No existing response found or failed to fetch:', err);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch quiz:', error);
                toast.error('Failed to load quiz');
                navigate('/dashboard');
            } finally {
                setLoading(false);
            }
        };

        fetchQuiz();
    }, [quizId, navigate, handleSubmitQuiz]);

    // Join quiz room
    useEffect(() => {
        if (socket && quizId) {
            joinQuiz(quizId);
            return () => leaveQuiz(quizId);
        }
    }, [socket, quizId, joinQuiz, leaveQuiz]);

    // Socket event listeners
    useEffect(() => {
        if (!socket) return;

        const handleQuizStart = (data) => {
            console.log('Socket: quiz:started', data);
            setStatus('active');
            setQuestions(data.questions || questions);
            setCurrentIndex(0);

            if (data.expiresAt) {
                const expires = new Date(data.expiresAt).getTime();
                const now = Date.now();
                const remaining = Math.max(0, Math.floor((expires - now) / 1000));
                setOverallTimeLeft(remaining);
            } else if (data.settings?.quizTimer) {
                setOverallTimeLeft(data.settings.quizTimer);
            }

            toast.success('Quiz has started!');
        };

        const handleQuestionUpdate = (data) => {
            console.log('Socket: quiz:question', data);
            setCurrentIndex(data.questionIndex);

            // Check if we already have an answer for this question
            const currentQ = questions[data.questionIndex];
            const savedAns = savedAnswers[currentQ?._id];

            if (savedAns) {
                setSelectedAnswer(savedAns);
                setTextAnswer(savedAns);
                setIsAnswered(true);
            } else {
                setSelectedAnswer('');
                setTextAnswer('');
                setIsAnswered(false);
            }
            setFeedback(null);
        };

        const handleAnswerFeedback = (data) => {
            console.log('Socket: answer:feedback', data);
            setFeedback(data);
            setScore(data.totalScore);
            if (data.isCorrect) {
                setCorrectCount(prev => prev + 1);
            }
        };

        const handleLeaderboardUpdate = (data) => {
            setLeaderboard(data.leaderboard || []);
        };

        const handleQuizEnd = (data) => {
            console.log('Socket: quiz:ended', data);

            // Stop timer locally immediately
            if (timerRef.current) clearInterval(timerRef.current);
            if (globalTimerRef.current) clearInterval(globalTimerRef.current);
            setTimeLeft(0);
            setOverallTimeLeft(0);

            setStatus('finished');
            setLeaderboard(data.leaderboard || []);
            setShowLeaderboard(true);

            toast(data.autoEnded ? "⏰ Quiz time expired! Auto-submitted." : "🏁 Quiz has been ended by the host.", {
                icon: '🏁',
                duration: 5000
            });

            localStorage.removeItem(`quiz_${quizId}_answers`);

            // Explicitly leave quiz room
            if (leaveQuiz) {
                leaveQuiz(quizId);
            }
        };

        const handleQuizTerminated = (data) => {
            toast.error(data.reason || 'You have been removed from the quiz.');
            navigate('/dashboard');
        };

        const cleanups = [
            on('quiz:started', handleQuizStart),
            on('quiz:question', handleQuestionUpdate),
            on('answer:feedback', handleAnswerFeedback),
            on('leaderboard:update', handleLeaderboardUpdate),
            on('quiz:ended', handleQuizEnd),
            on('quiz:terminated', handleQuizTerminated)
        ];

        return () => cleanups.forEach(cleanup => cleanup && cleanup());
    }, [socket, on, questions, savedAnswers, quizId, leaveQuiz]);

    // Overall Global Timer logic
    useEffect(() => {
        if (status !== 'active' || overallTimeLeft <= 0) return;

        globalTimerRef.current = setInterval(() => {
            setOverallTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(globalTimerRef.current);
                    toast.error('Quiz time is up!');
                    // Force submit on expiry
                    handleSubmitQuiz(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (globalTimerRef.current) clearInterval(globalTimerRef.current);
        };
    }, [status, overallTimeLeft > 0, handleSubmitQuiz]);

    // Per-Question Timer Logic
    useEffect(() => {
        if (status === 'active' && quiz?.settings?.questionTimer > 0) {
            setTimeLeft(quiz.settings.questionTimer);
        }
    }, [currentIndex, status, quiz]);

    useEffect(() => {
        if (status !== 'active' || timeLeft <= 0 || isAnswered) return;

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [status, currentIndex, isAnswered, timeLeft > 0]);

    // Auto-submit on per-question timeout
    useEffect(() => {
        if (status === 'active' && timeLeft === 0 && !isAnswered && quiz?.settings?.questionTimer > 0) {
            handleAnswerSubmit(true);
        }
    }, [timeLeft, status, isAnswered, quiz, handleAnswerSubmit]);

    // Cheating Detection
    useEffect(() => {
        const handleCheating = () => {
            if (status === 'active' && !quiz?.settings?.allowTabSwitch) {
                setTabSwitchCount(prev => {
                    const newCount = prev + 1;
                    setShowTabWarning(true);
                    reportTabSwitch(quizId);

                    if (quiz?.settings?.maxTabSwitches > 0 && newCount >= quiz.settings.maxTabSwitches) {
                        toast.error('Quiz terminated due to unauthorized activity');
                        setStatus('completed');
                    }
                    return newCount;
                });
            }
        };

        const handleBlur = () => {
            // Emit focus lost event for trust score deduction
            if (socket && status === 'active') {
                socket.emit('focus:lost', { quizId });
            }
            handleCheating();
        };

        document.addEventListener('visibilitychange', () => { if (document.hidden) handleCheating(); });
        window.addEventListener('blur', handleBlur);

        return () => {
            document.removeEventListener('visibilitychange', handleCheating);
            window.removeEventListener('blur', handleBlur);
        };
    }, [status, quiz, reportTabSwitch, quizId, socket]);

    const handleNextQuestion = () => {
        if (currentIndex < questions.length - 1) {
            goToQuestion(currentIndex + 1);
        }
    };

    const handlePrevQuestion = () => {
        if (currentIndex > 0) {
            goToQuestion(currentIndex - 1);
        }
    };

    const formatTime = useCallback((seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }, []);

    if (loading) return <div className="quiz-loading-modern"><div className="loader-orbit"></div><p>Syncing with Server...</p></div>;

    // Waiting Screen (Modern)
    if (status === 'waiting') {
        return (
            <div className="quiz-waiting-modern">
                <div className="waiting-glass-card">
                    <div className="pulse-logo">
                        <FiZap className="zap-icon" />
                    </div>
                    <h1>Ready for the Challenge?</h1>
                    <p className="waiting-text">The instructor will launch the quiz shortly. Brace yourself!</p>

                    <div className="quiz-stats-banner">
                        <div className="stat-banner-item">
                            <FiUsers />
                            <span>{quiz?.participants?.length || 0} competing</span>
                        </div>
                        <div className="stat-banner-item">
                            <FiZap />
                            <span>{questions.length} questions</span>
                        </div>
                        <div className="stat-banner-item">
                            <FiClock />
                            <span>{quiz?.settings?.quizTimer ? formatTime(quiz.settings.quizTimer) : 'No limit'}</span>
                        </div>
                    </div>

                    <div className="waiting-footer">
                        <div className="loading-dots">
                            <span></span><span></span><span></span>
                        </div>
                        <p>Waiting for Host...</p>
                    </div>
                </div>
            </div>
        );
    }

    // Completed View (Premium Leaderboard)
    if (status === 'completed' || status === 'finished' || showLeaderboard) {
        if (reviewMode && reviewData) {
            return (
                <div className="play-quiz-premium review-mode">
                    <div className="review-scroll-container">
                        <div className="review-header-sticky">
                            <button className="back-link-btn" onClick={() => setReviewMode(false)}><FiArrowLeft /> Return to Results</button>
                            <h1>Question Analysis</h1>
                        </div>
                        <div className="review-cards-stack">
                            {reviewData.quizId?.questions?.map((q, idx) => {
                                const answer = reviewData.answers.find(a => a.questionId === q._id);
                                return (
                                    <div key={q._id} className={`premium-review-card ${answer?.isCorrect ? 'is-correct' : 'is-incorrect'}`}>
                                        <div className="review-card-top">
                                            <span className="q-label">QUESTION {idx + 1}</span>
                                            <div className="score-tag">
                                                {answer?.pointsEarned || 0} / {q.points} PTS
                                            </div>
                                        </div>
                                        <h3 className="review-q-text">{q.text}</h3>
                                        <div className="comparison-grid">
                                            <div className="comparison-item yours">
                                                <label>YOUR RESPONSE</label>
                                                <div className="value">{answer?.answer || 'Skipped'}</div>
                                            </div>
                                            <div className="comparison-item correct">
                                                <label>CORRECT ANSWER</label>
                                                <div className="value">{q.correctAnswer}</div>
                                            </div>
                                        </div>

                                        <div className="ai-review-section">
                                            {explanations[q._id] ? (
                                                <div className="ai-explanation-box animate-fadeIn">
                                                    <div className="ai-label"><FiCpu /> AI REVIEW</div>
                                                    <p>{explanations[q._id]}</p>
                                                </div>
                                            ) : (
                                                <button
                                                    className="btn-ai-review"
                                                    disabled={explainingQId === q._id}
                                                    onClick={() => handleAIExplain(q, answer?.answer, q.correctAnswer)}
                                                >
                                                    {explainingQId === q._id ? (
                                                        <><span className="spinner-sm"></span> ANALYZING...</>
                                                    ) : (
                                                        <><FiCpu /> GET AI REVIEW</>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            );
        }

        const userRank = leaderboard.findIndex(l => String(l.userId?._id || l.studentId) === String(user?._id)) + 1;
        const percentage = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

        return (
            <div className="quiz-finished-premium">
                <div className="results-hero-card animate-popIn">
                    <div className="hero-glow"></div>
                    <div className="results-header">
                        <h1>Mission Accomplished!</h1>
                        <p className="quiz-title-muted">{quiz?.title}</p>
                    </div>

                    <div className="glory-stats-grid">
                        <div className="glory-stat-card primary">
                            <FiZap className="stat-icon" />
                            <span className="stat-val">{score}</span>
                            <span className="stat-lbl">TOTAL POINTS</span>
                        </div>
                        <div className="glory-stat-card success">
                            <FiTrendingUp className="stat-icon" />
                            <span className="stat-val">{percentage}%</span>
                            <span className="stat-lbl">ACCURACY</span>
                        </div>
                        <div className="glory-stat-card gold">
                            <FiAward className="stat-icon" />
                            <span className="stat-val">#{userRank || 'N/A'}</span>
                            <span className="stat-lbl">FINAL RANK</span>
                        </div>
                    </div>

                    <div className="podium-area">
                        <h3>Battlefield Standings</h3>
                        <div className="leaderboard-premium-list">
                            {leaderboard.slice(0, 5).map((entry, idx) => (
                                <div key={idx} className={`leaderboard-row ${String(entry.userId?._id || entry.studentId) === String(user?._id) ? 'is-me' : ''}`}>
                                    <div className="rank-disk">{idx + 1}</div>
                                    <div className="player-info">
                                        <span className="p-name">{entry.userId?.name || entry.studentName}</span>
                                        {String(entry.userId?._id || entry.studentId) === String(user?._id) && <span className="me-tag">YOU</span>}
                                    </div>
                                    <div className="p-score">{entry.totalScore || entry.score} PTS</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="results-actions">
                        <button className="btn-premium secondary" onClick={handleViewReview}>ANALYSIS</button>
                        <button className="btn-premium primary" onClick={() => navigate('/dashboard')}>EXIT GAME</button>
                    </div>
                </div>
            </div>
        );
    }

    const currentQuestion = questions[currentIndex];

    // Navigation Drawer Component
    const QuestionDrawer = () => (
        <>
            <div className={`nav-backdrop ${showQuestionPanel ? 'active' : ''}`} onClick={() => setShowQuestionPanel(false)}></div>
            <div className={`question-drawer ${showQuestionPanel ? 'open' : ''}`}>
                <div className="drawer-header">
                    <h3>Questions Panel</h3>
                    <button className="close-btn" onClick={() => setShowQuestionPanel(false)}><FiXCircle /></button>
                </div>
                <div className="drawer-grid">
                    {questions.map((q, idx) => {
                        const isAnsweredQ = !!savedAnswers[q?._id];
                        const isCurrentQ = idx === currentIndex;
                        return (
                            <button
                                key={idx}
                                className={`drawer-cell ${isAnsweredQ ? 'answered' : 'unanswered'} ${isCurrentQ ? 'current' : ''}`}
                                onClick={() => goToQuestion(idx)}
                            >
                                <span className="cell-num">{idx + 1}</span>
                                {isAnsweredQ && <FiCheckCircle className="cell-icon" />}
                            </button>
                        );
                    })}
                </div>
                <div className="drawer-legend">
                    <div className="legend-item"><span className="dot current"></span> Current</div>
                    <div className="legend-item"><span className="dot answered"></span> Answered</div>
                    <div className="legend-item"><span className="dot unanswered"></span> Pending</div>
                </div>
            </div>
        </>
    );

    return (
        <ErrorBoundary>
            <div className="play-quiz-game">
                <QuestionDrawer />

                {showTabWarning && (
                    <div className="security-overlay">
                        <div className="security-card animate-shake">
                            <FiAlertTriangle className="warn-icon" />
                            <h2>Violation Detected</h2>
                            <p>Switching windows or tabs is strictly prohibited in competitive mode.</p>
                            <div className="warning-meter">
                                <span>Risk Level: {tabSwitchCount}/{quiz?.settings?.maxTabSwitches || '∞'}</span>
                                <div className="meter-bg"><div className="meter-fill" style={{ width: `${(tabSwitchCount / (quiz?.settings?.maxTabSwitches || 10)) * 100}%` }}></div></div>
                            </div>
                            <button className="btn-modern-primary" onClick={() => setShowTabWarning(false)}>I UNDERSTAND</button>
                        </div>
                    </div>
                )}

                <div className="game-hud">
                    <div className="hud-left">
                        <button className="questions-panel-btn" onClick={() => setShowQuestionPanel(true)}>
                            <FiZap /> <span>Questions {currentIndex + 1}/{questions.length}</span>
                        </button>
                    </div>

                    <div className="hud-center">
                        {/* Removed random palette */}
                        <div className="quiz-title-hud">{quiz?.title}</div>
                    </div>

                    <div className="hud-right">
                        <div className="score-ticker">
                            <FiZap className="zap-icon-score" />
                            <span className="score-num">{score}</span>
                        </div>
                        {overallTimeLeft > 0 && (
                            <div className={`countdown-clock ${overallTimeLeft <= 60 ? 'critical' : ''}`}>
                                <FiClock />
                                <span>{formatTime(overallTimeLeft)}</span>
                            </div>
                        )}
                    </div>
                </div>

                <main className="question-theatre">
                    <div className="question-stage animate-fadeInUp" key={currentIndex}>
                        <div className="question-meta-tags">
                            <span className={`difficulty-tag ${currentQuestion?.difficulty}`}>{currentQuestion?.difficulty}</span>
                            <span className="points-tag">{currentQuestion?.points} PTS</span>
                        </div>

                        <h2 className="main-question-text">{currentQuestion?.text}</h2>

                        {(currentQuestion?.type === 'mcq' || currentQuestion?.type === 'msq') && (
                            <div className="modern-options-grid">
                                {currentQuestion?.options?.map((option, idx) => {
                                    const isSelected = currentQuestion?.type === 'mcq'
                                        ? selectedAnswer === option
                                        : selectedAnswer.split(',').filter(Boolean).includes(option);

                                    const isCorrectOpt = isAnswered && feedback && (
                                        currentQuestion.type === 'mcq'
                                            ? feedback?.correctAnswer === option
                                            : feedback?.correctAnswer?.split(',').includes(option)
                                    );

                                    const isWrongOpt = isAnswered && feedback && isSelected && !isCorrectOpt;

                                    return (
                                        <button
                                            key={idx}
                                            className={`modern-option-card ${isSelected ? 'is-selected' : ''} ${isCorrectOpt ? 'is-correct' : ''} ${isWrongOpt ? 'is-wrong' : ''}`}
                                            onClick={() => handleOptionSelect(option)}
                                            style={{ opacity: 1 }} // Keep full opacity for better visibility
                                        >
                                            <div className="option-indicator">
                                                {currentQuestion.type === 'msq' ? (
                                                    <input type="checkbox" checked={isSelected} readOnly />
                                                ) : (
                                                    String.fromCharCode(65 + idx)
                                                )}
                                            </div>
                                            <div className="option-content-text">{option}</div>
                                            {isCorrectOpt && <FiCheckCircle className="opt-feedback-icon" />}
                                            {isWrongOpt && <FiXCircle className="opt-feedback-icon" />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {(currentQuestion?.type === 'fill-blank' || currentQuestion?.type === 'qa') && (
                            <div className="modern-input-field">
                                <input
                                    type="text"
                                    className="game-text-input"
                                    value={textAnswer}
                                    onChange={(e) => setTextAnswer(e.target.value)}
                                    onBlur={() => handleAnswerSubmit(false, textAnswer)} // Auto-save on blur
                                    placeholder="TYPE YOUR RESPONSE HERE..."
                                    autoFocus
                                />
                            </div>
                        )}

                        <div className="game-controls">
                            <div className="navigation-group">
                                <button className="ctrl-btn secondary" onClick={handlePrevQuestion} disabled={currentIndex === 0}>
                                    PREVIOUS
                                </button>
                                <button className="ctrl-btn secondary" onClick={handleNextQuestion} disabled={currentIndex === questions.length - 1}>
                                    NEXT
                                </button>
                            </div>

                            <div className="right-controls">
                                <button className="ctrl-btn success" onClick={() => handleSubmitQuiz(false)} disabled={isSubmitting}>
                                    {isSubmitting ? 'SUBMITTING...' : 'SUBMIT QUIZ'}
                                </button>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </ErrorBoundary>
    );
};

export default PlayQuiz;
