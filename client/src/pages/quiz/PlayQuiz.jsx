import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { quizAPI, responseAPI } from '../../services/api';
import { FiClock, FiUsers, FiZap, FiCheckCircle, FiInfo } from 'react-icons/fi';
import toast from 'react-hot-toast';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import './PlayQuiz.css';

const PlayQuiz = () => {
    const { quizId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { socket, joinQuiz, leaveQuiz, submitAnswer, on, off, connected, isReconnecting } = useSocket();

    // Quiz State
    const [quiz, setQuiz] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [status, setStatus] = useState('waiting');
    const [loading, setLoading] = useState(true);
    const [isDataReady, setIsDataReady] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [responseId, setResponseId] = useState(null);

    // Answer State
    const [selectedAnswer, setSelectedAnswer] = useState('');
    const [textAnswer, setTextAnswer] = useState('');
    const [isAnswered, setIsAnswered] = useState(false);
    const [savedAnswers, setSavedAnswers] = useState({}); // { questionId: answer }

    // Stats & UI
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);
    const [leaderboard, setLeaderboard] = useState([]);
    const [participantCount, setParticipantCount] = useState(0);
    const timerRef = useRef(null);

    // --- Core Synchronization ---
    const requestSync = useCallback(() => {
        if (socket && connected) {
            console.log('📡 [SYNC] Requesting ground truth for:', quizId);
            socket.emit('quiz:sync', { quizId });
        }
    }, [socket, connected, quizId]);

    useEffect(() => {
        const fetchBaseData = async () => {
            try {
                setLoading(true);
                const response = await quizAPI.getById(quizId);
                const data = response.data.data.quiz;
                setQuiz(data);
                const qs = data.questions || [];
                setQuestions(qs);
                setIsDataReady(true);

                console.log('✅ [INIT] Quiz data loaded:', data.title, 'Status:', data.status);

                if (['finished', 'completed'].includes(data.status)) {
                    setStatus('finished');
                    setLoading(false);
                } else if (connected) {
                    console.log('📡 [INIT] Requesting fresh sync...');
                    socket.emit('quiz:sync', { quizId });
                }
            } catch (err) {
                console.error('Fetch Quiz Error:', err);
                toast.error('Failed to load quiz');
                navigate('/dashboard');
            }
        };
        fetchBaseData();
    }, [quizId, connected, socket, navigate]); // Removed requestSync from deps to control flow

    // Handle Socket Events
    useEffect(() => {
        if (!socket) return;

        const handleSyncState = (data) => {
            console.log('🔄 [SYNC] State recovery:', data);
            setStatus(data.status);
            // Ensure index is never negative on the client
            setCurrentIndex(Math.max(0, data.currentQuestionIndex || 0));
            setScore(data.totalScore || 0);

            // Restore answers
            const answersMap = {};
            if (data.savedAnswers) {
                data.savedAnswers.forEach(a => { if (a.answer) answersMap[a.questionId] = a.answer; });
            }
            setSavedAnswers(answersMap);

            // Set current Q state
            const targetIndex = Math.max(0, data.currentQuestionIndex || 0);
            const currentQId = questions[targetIndex]?._id;
            if (currentQId && answersMap[currentQId]) {
                const ans = answersMap[currentQId];
                setSelectedAnswer(ans);
                setTextAnswer(ans);
                setIsAnswered(true);
            } else {
                setSelectedAnswer('');
                setTextAnswer('');
                setIsAnswered(false);
            }

            if (data.remainingTime) setTimeLeft(Math.floor(data.remainingTime / 1000));

            // Critical: Ensure questions exist before turning off loader
            if (isDataReady) setLoading(false);
            if (data.responseId) setResponseId(data.responseId);
        };

        const handleStateChange = (data) => {
            console.log('⚡ [STATE] Changed to:', data.status);
            setStatus(data.status);
            if (data.currentQuestionIndex !== undefined) {
                setCurrentIndex(Math.max(0, data.currentQuestionIndex));
                setIsAnswered(false);
                setSelectedAnswer('');
                setTextAnswer('');
            }
            if (data.expiresAt) {
                const diff = (new Date(data.expiresAt).getTime() - Date.now()) / 1000;
                setTimeLeft(Math.max(0, Math.floor(diff)));
            }
            if (data.leaderboard) setLeaderboard(data.leaderboard);
        };

        const handleFeedback = (data) => {
            console.log('🎯 [FEEDBACK] Server acknowledged answer:', data);
            setScore(data.totalScore);
            setIsSubmitting(false); // ✅ Reset on server ack as requested
        };

        const handleQuizCompleted = (data) => {
            console.log('🏁 [COMPLETED] Quiz session finalized:', data);
            toast.success('Quiz completed! Redirecting to results...');
            const rId = data.responseId || responseId;
            if (rId) {
                navigate(`/history/report/${rId}`);
            } else {
                setStatus('finished');
            }
        };

        socket.on('quiz:sync_state', handleSyncState);
        socket.on('quiz:state_changed', handleStateChange);
        socket.on('answer:feedback', handleFeedback);
        socket.on('quiz:completed', handleQuizCompleted);
        socket.on('participant:count_update', (data) => setParticipantCount(data.count));
        socket.on('quiz:ended', (data) => {
            console.log('🏁 [END] Quiz finished by host');
            setLeaderboard(data.leaderboard || []);

            // Try to navigate to report if we have rId
            const rId = responseId;
            if (rId) {
                toast.success('Quiz ended! Closing arena...');
                navigate(`/history/report/${rId}`);
            } else {
                setStatus('done');
            }
        });

        return () => {
            socket.off('quiz:sync_state', handleSyncState);
            socket.off('quiz:state_changed', handleStateChange);
            socket.off('answer:feedback', handleFeedback);
            socket.off('quiz:completed', handleQuizCompleted);
            socket.off('quiz:ended');
        };
    }, [socket, questions, quizId]);

    // Re-sync on reconnection
    useEffect(() => {
        if (connected) requestSync();
    }, [connected, requestSync]);

    // Timer Logic
    useEffect(() => {
        if (status !== 'question_active' || timeLeft <= 0 || isAnswered) return;
        timerRef.current = setInterval(() => {
            setTimeLeft(p => p > 0 ? p - 1 : 0);
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, [status, timeLeft, isAnswered]);

    // Join/Leave
    useEffect(() => {
        if (socket && quizId) {
            joinQuiz(quizId);
            return () => leaveQuiz(quizId);
        }
    }, [socket, quizId, joinQuiz, leaveQuiz]);

    const handleAnswerSubmit = useCallback((answerOverride = null) => {
        // 🏆 Broadened for testing: allow interaction in draft/waiting too
        const isActive = ['active', 'question_active', 'draft', 'waiting'].includes(status);
        console.log('📩 [ANSWER] Attempting submit | Status:', status, 'Active:', isActive, 'Submitting:', isSubmitting, 'Connected:', connected);

        if (!isActive || isSubmitting || !connected) return;

        const currentQuestion = questions[currentIndex];
        const answer = answerOverride !== null ? answerOverride : (['mcq', 'msq'].includes(currentQuestion?.type?.toLowerCase()) ? selectedAnswer : textAnswer);

        if (!answer) return;

        setIsSubmitting(true);
        setSavedAnswers(p => ({ ...p, [currentQuestion._id]: answer }));
        setIsAnswered(true);

        socket.emit('answer:submit', {
            quizId,
            questionId: currentQuestion._id,
            answer,
            timeTaken: (quiz?.settings?.questionTimer - timeLeft) * 1000
        });

        // Finalize submission state - usually server feedback would trigger this if we were strictly synchronous
        // But for smooth UI we release it after a short delay or on feedback
        setTimeout(() => setIsSubmitting(false), 800);
    }, [status, currentIndex, questions, selectedAnswer, textAnswer, quizId, timeLeft, quiz, isSubmitting, connected, socket]);

    const goToQuestion = (idx) => {
        if (idx < 0 || idx >= questions.length) return;
        setCurrentIndex(idx);
        const saved = savedAnswers[questions[idx]?._id];
        setSelectedAnswer(saved || '');
        setTextAnswer(saved || '');
        // We don't set isAnswered to true automatically if we want them to be able to change it
        // and only "submit" for local state tracking
        setIsAnswered(!!saved);
    };

    const handleFinalSubmit = async () => {
        if (!window.confirm('Are you sure you want to submit your quiz?')) return;
        try {
            setLoading(true);
            // 🚀 1. Call API for persistent DB update
            await responseAPI.completeQuiz({ quizId });

            // 🚀 2. Signal server via socket to trigger real-time rank updates & faculty notifications
            if (socket && connected) {
                socket.emit('quiz:complete', { quizId });
            }

            toast.success('Quiz submitted successfully!');
        } catch (error) {
            console.error('Final submit failed:', error);
            toast.error('Submission failed. Check your connection.');
        } finally {
            setLoading(false);
            setIsSubmitting(false);
        }
    };

    if (loading) return <div className="quiz-loading-modern"><div className="loader-orbit"></div><p>Syncing Arena...</p></div>;

    if (['waiting', 'draft', 'scheduled'].includes(status)) {
        return (
            <div className="quiz-waiting-modern">
                <div className="waiting-glass-card animate-fadeInUp">
                    <div className="pulse-logo"><FiZap className="zap-icon" /></div>
                    <h1>Ready for Battle?</h1>
                    <p>The host is preparing the arena. Stay sharp.</p>
                    <div className="quiz-stats-banner">
                        <div className="stat-banner-item"><FiUsers /> <span>{participantCount || quiz?.participantCount || 0} Joined</span></div>
                        <div className="stat-banner-item"><FiZap /> <span>{questions.length} Items</span></div>
                    </div>
                </div>
            </div>
        );
    }

    if (status === 'finished' || status === 'done') {
        return (
            <div className="quiz-finished-premium animate-fadeIn">
                <div className="results-hero-card">
                    <div className="hero-glow"></div>
                    <h1>Victory & Glory!</h1>
                    <div className="glory-stats-grid">
                        <div className="glory-stat-card primary"><FiZap /> <span className="stat-val">{score}</span> <span className="stat-lbl">FINAL SCORE</span></div>
                        <div className="glory-stat-card gold"><FiUsers /> <span className="stat-val">#{leaderboard.findIndex(l => String(l.userId?._id || l.studentId) === String(user?._id)) + 1 || '-'}</span> <span className="stat-lbl">YOUR RANK</span></div>
                    </div>
                    <div className="podium-area">
                        <h3>Leaderboard Standings</h3>
                        <div className="leaderboard-premium-list">
                            {leaderboard.slice(0, 5).map((l, idx) => (
                                <div key={idx} className={`leaderboard-row ${String(l.userId?._id || l.studentId) === String(user?._id) ? 'is-me' : ''}`}>
                                    <div className="rank-disk">{idx + 1}</div>
                                    <div className="player-info">{l.userId?.name || l.studentName}</div>
                                    <div className="p-score">{l.totalScore || l.score}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="action-buttons-stack">
                        <button className="btn-premium primary" style={{ marginBottom: '1rem' }} onClick={() => navigate(`/history/report/${responseId}`)}>REVIEW DETAILED ANALYTICS</button>
                        <button className="btn-premium secondary" onClick={() => navigate('/dashboard')}>EXIT ARENA</button>
                    </div>
                </div>
            </div>
        );
    }

    const q = questions[currentIndex];

    // --- Diagnostic Logs ---
    console.log(`[ARENA] State: ${status} | Submitting: ${isSubmitting} | Connected: ${connected} | QIdx: ${currentIndex}`);

    return (
        <ErrorBoundary>
            <div className={`play-quiz-game ${!connected ? 'socket-lost' : ''}`}>
                {!connected && (
                    <div className="connection-lost-overlay">
                        <div className="reconnect-box">
                            <div className="reconnect-spinner"></div>
                            <h3>📡 Connection Offline</h3>
                            <p>Hang tight! We're bringing you back into the arena...</p>
                        </div>
                    </div>
                )}

                <div className="play-area-layout redesign">
                    {/* Top Navigation Panel (Horizontal) */}
                    <div className="top-nav-panel">
                        <div className="nav-horizontal-scroll">
                            {questions.map((_, i) => {
                                const qId = questions[i]._id;
                                const isAns = !!savedAnswers[qId];
                                const isCurr = currentIndex === i;
                                return (
                                    <div
                                        key={i}
                                        className={`nav-number-circle ${isCurr ? 'active' : isAns ? 'answered' : 'unanswered'}`}
                                        onClick={() => goToQuestion(i)}
                                    >
                                        {i + 1}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="top-stats-bar">
                            <div className="stat-pill"><FiClock /> {timeLeft}s</div>
                            <div className="stat-pill primary">Score: {score}</div>
                            <div className="stat-pill">Points: {q?.points}</div>
                        </div>
                    </div>

                    {/* Question Panel (Main Content) */}
                    <main className="question-play-arena">
                        <div className="question-card-interactive animate-fadeIn">
                            <div className="q-header">
                                <span className="q-index-tag">Question {currentIndex + 1} of {questions.length}</span>
                                <h2 className="q-text-display">{q?.text}</h2>
                            </div>

                            <div className="options-grid-container">
                                {(['mcq', 'msq'].includes(q?.type?.toLowerCase()) || (q?.options && q?.options.length > 0)) ? (
                                    <div className="mcq-options-layout">
                                        {q?.options?.map((opt, i) => {
                                            const isSelected = selectedAnswer === opt;
                                            const isActive = ['active', 'question_active', 'live', 'draft', 'waiting'].includes(status) && !isSubmitting && connected;
                                            return (
                                                <button
                                                    key={i}
                                                    className={`mcq-option-btn ${isSelected ? 'selected' : ''}`}
                                                    onClick={() => {
                                                        if (isActive) {
                                                            setSelectedAnswer(opt);
                                                            handleAnswerSubmit(opt);
                                                        }
                                                    }}
                                                    disabled={!isActive}
                                                >
                                                    <span className="opt-marker">{String.fromCharCode(65 + i)}</span>
                                                    <span className="opt-text">{opt}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-answer-arena">
                                        {['qa', 'question-answer'].includes(q?.type?.toLowerCase()) ? (
                                            <textarea
                                                className="qa-textarea"
                                                placeholder="Type your detailed answer here..."
                                                value={textAnswer}
                                                onChange={e => setTextAnswer(e.target.value)}
                                                onBlur={() => handleAnswerSubmit()}
                                                disabled={!['active', 'question_active', 'live', 'draft', 'waiting'].includes(status) || isSubmitting || !connected}
                                            />
                                        ) : (
                                            <input
                                                className="fill-blank-input"
                                                placeholder="Type the correct word..."
                                                value={textAnswer}
                                                onChange={e => setTextAnswer(e.target.value)}
                                                onBlur={() => handleAnswerSubmit()}
                                                disabled={!['active', 'question_active', 'live', 'draft', 'waiting'].includes(status) || isSubmitting || !connected}
                                            />
                                        )}
                                        <div className="text-help">Your answer is automatically saved as you type.</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </main>

                    {/* Footer Actions (Bottom Panel) */}
                    <footer className="quiz-controls-footer">
                        <div className="controls-inner">
                            <button
                                className="control-btn secondary"
                                onClick={() => goToQuestion(currentIndex - 1)}
                                disabled={currentIndex === 0}
                            >
                                Previous
                            </button>

                            <button
                                className="control-btn secondary"
                                onClick={() => goToQuestion(currentIndex + 1)}
                                disabled={currentIndex === questions.length - 1}
                            >
                                Next
                            </button>

                            <button
                                className="control-btn primary submit-btn"
                                onClick={handleFinalSubmit}
                                disabled={loading || isSubmitting}
                            >
                                {loading ? 'Processing...' : 'Final Submit'}
                            </button>
                        </div>
                    </footer>
                </div>
            </div>
        </ErrorBoundary>
    );
};

export default PlayQuiz;
