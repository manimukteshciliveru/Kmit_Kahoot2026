import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { quizAPI, responseAPI } from '../../services/api';
import { FiClock, FiUsers, FiZap, FiCheckCircle, FiInfo } from 'react-icons/fi';
import toast from 'react-hot-toast';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import localforage from 'localforage';
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
    
    // Server Clock Synchronization
    const serverTimeOffsetRef = useRef(0);
    const getServerTime = useCallback(() => Date.now() + serverTimeOffsetRef.current, []);
    
    const questionStartTimeRef = useRef(Date.now());

    // --- Answer State (Centralized) ---
    // Structure: { [questionId]: "Selected Option or Text" }
    const [answers, setAnswers] = useState({});

    // Temporary local state for text input smoothness
    const [localTextAnswer, setLocalTextAnswer] = useState('');

    // Persistence Layer Initialization
    useEffect(() => {
        if (quizId) {
            localforage.getItem(`quiz_answers_${quizId}`).then(saved => {
                if (saved) setAnswers(saved);
            }).catch(console.error);
        }
    }, [quizId]);

    // Stats & UI
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);
    const [timerDuration, setTimerDuration] = useState(30); // Total timer for current question (dynamic from server)
    const [quizTimeLeft, setQuizTimeLeft] = useState(0); // Overall quiz timer
    const [leaderboard, setLeaderboard] = useState([]);
    const [participantCount, setParticipantCount] = useState(0);
    const timerRef = useRef(null);
    const quizTimerRef = useRef(null);
    const autoSubmittedRef = useRef(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [scheduledCountdown, setScheduledCountdown] = useState('');

    // Computed: percentage of timer remaining (0–100) for progress bar
    const timerPercent = timerDuration > 0 ? Math.max(0, Math.min(100, (timeLeft / timerDuration) * 100)) : 0;
    // Color: green → yellow → red based on urgency
    const timerColor = timeLeft <= 5 ? '#EF4444' : timeLeft <= 10 ? '#F59E0B' : '#10B981';


    // --- Core Synchronization ---
    const requestSync = useCallback(() => {
        if (socket && connected) {
            console.log('📡 [SYNC] Requesting ground truth for:', quizId);
            socket.emit('quiz:sync', { quizId });
        }
    }, [socket, connected, quizId]);

    // Manual Refresh handler for student waiting screen
    const handleManualSync = useCallback(async () => {
        setIsSyncing(true);
        try {
            const response = await quizAPI.getById(quizId);
            const data = response.data.data.quiz;
            if (['active', 'live', 'question_active'].includes(data.status)) {
                setStatus(data.status);
                setQuestions(data.questions || []);
                toast.success('✅ Quiz has started! Loading questions...');
            } else {
                // Also ping socket sync
                requestSync();
                toast('🔄 Still waiting for host to start...', { icon: '⏳' });
            }
        } catch (e) {
            toast.error('Failed to sync. Check your connection.');
        } finally {
            setIsSyncing(false);
        }
    }, [quizId, requestSync]);

    useEffect(() => {
        const fetchBaseData = async () => {
            try {
                setLoading(true);
                const response = await quizAPI.getById(quizId);
                
                // Calculate Server Clock Drift natively measuring header origin
                if (response.headers && response.headers.date) {
                    const serverTime = new Date(response.headers.date).getTime();
                    serverTimeOffsetRef.current = serverTime - Date.now();
                }

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
            setCurrentIndex(Math.max(0, data.currentQuestionIndex || 0));
            setScore(data.totalScore || 0);

            // Merge server answers with any locally cached answers (from localStorage)
            // to prevent data loss when student goes offline
            const serverAnswersMap = {};
            if (data.savedAnswers) {
                data.savedAnswers.forEach(a => { if (a.answer) serverAnswersMap[a.questionId] = a.answer; });
            }

            // Try to recover local answers saved before disconnect async
            localforage.getItem(`quiz_answers_${quizId}`).then(cached => {
                const localAnswers = cached || {};
                const mergedAnswers = { ...localAnswers, ...serverAnswersMap };
                setAnswers(mergedAnswers);

                // Re-submit any local-only answers to server on reconnect
                if (socket && data.status === 'in-progress') {
                    Object.entries(localAnswers).forEach(([qId, ans]) => {
                        if (!serverAnswersMap[qId] && ans) {
                            console.log('📤 [RESYNC] Re-submitting local answer for Q:', qId);
                            socket.emit('answer:submit', {
                                quizId,
                                questionId: qId,
                                answer: ans,
                                timeTaken: 0 
                            });
                        }
                    });
                }

                const targetIndex = Math.max(0, data.currentQuestionIndex || 0);
                const currentQId = questions[targetIndex]?._id;
                if (currentQId && mergedAnswers[currentQId]) {
                    setLocalTextAnswer(mergedAnswers[currentQId]);
                } else {
                    setLocalTextAnswer('');
                }
            }).catch(console.error);

            if (data.remainingTime) {
                const secs = Math.floor(data.remainingTime / 1000);
                setTimeLeft(secs);
                setQuizTimeLeft(secs);
            }

            if (isDataReady) setLoading(false);
            if (data.responseId) setResponseId(data.responseId);
        };

        const handleStateChange = (data) => {
            console.log('⚡ [STATE] Changed to:', data.status);
            setStatus(data.status);
            if (data.currentQuestionIndex !== undefined) {
                setCurrentIndex(Math.max(0, data.currentQuestionIndex));
            }
            if (data.expiresAt) {
                const diff = (new Date(data.expiresAt).getTime() - getServerTime()) / 1000;
                const secs = Math.max(0, Math.floor(diff));
                setTimeLeft(secs);
                setTimerDuration(secs); // Dynamic timer from server
                setQuizTimeLeft(secs);
            }
            // Handle dynamic timer attached to question (survival / AI mode)
            if (data.timer !== undefined && data.timer > 0) {
                setTimeLeft(data.timer);
                setTimerDuration(data.timer);
            }
            if (data.leaderboard) setLeaderboard(data.leaderboard);
        };

        const handleFeedback = (data) => {
            console.log('🎯 [FEEDBACK] Server acknowledged answer:', data);
            setScore(data.totalScore);
            setIsSubmitting(false);
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

        // Handle auto-start from scheduler
        const handleQuizStarted = (data) => {
            console.log('🚀 [AUTO-START] Quiz started by scheduler:', data);
            setStatus('active');
            setCurrentIndex(0);
            if (data.questions) setQuestions(data.questions);
            if (data.expiresAt) {
                const diff = (new Date(data.expiresAt).getTime() - getServerTime()) / 1000;
                const secs = Math.max(0, Math.floor(diff));
                setTimeLeft(secs);
                setQuizTimeLeft(secs);
            }
            setLoading(false);
            toast.success('Quiz has started! Good luck! 🚀');
        };

        socket.on('quiz:sync_state', handleSyncState);
        socket.on('quiz:state_changed', handleStateChange);
        socket.on('quiz:started', handleQuizStarted);
        socket.on('quizStatusUpdate', (newStatus) => {
            console.log('⚡ [SOCKET] Status Update:', newStatus);
            setStatus(newStatus);
            if (newStatus === 'done') {
                toast.success('Quiz ended by host!');
                setStatus('done');
            }
        });
        socket.on('leaderboardUpdate', (lbData) => {
            console.log('📊 [SOCKET] Leaderboard Update:', lbData.length);
            setLeaderboard(lbData);
        });
        socket.on('answer:feedback', handleFeedback);
        socket.on('quiz:completed', handleQuizCompleted);
        socket.on('participant:count_update', (data) => setParticipantCount(data.count));
        socket.on('quiz:ended', (data) => {
            console.log('🏁 [END] Quiz finished (host or timer)');
            setLeaderboard(data.leaderboard || []);
            toast.success(data.autoEnded ? 'Time\'s up! Quiz ended automatically.' : 'Quiz ended! Closing arena...');
            setStatus('done');

            // Auto-redirect to results after 3 seconds
            setTimeout(() => {
                const rId = responseId;
                if (rId) {
                    navigate(`/history/report/${rId}`);
                }
            }, 3000);
        });

        return () => {
            socket.off('quiz:sync_state', handleSyncState);
            socket.off('quiz:state_changed', handleStateChange);
            socket.off('quiz:started', handleQuizStarted);
            socket.off('answer:feedback', handleFeedback);
            socket.off('quiz:completed', handleQuizCompleted);
            socket.off('quiz:ended');
            socket.off('quizStatusUpdate');
            socket.off('leaderboardUpdate');
            socket.off('participant:count_update');
        };
    }, [socket, questions, quizId]);

    // Re-sync on reconnection
    useEffect(() => {
        if (connected) requestSync();
    }, [connected, requestSync]);

    // --- Auto-poll fallback for scheduled/waiting quizzes ---
    // Silently checks every 15 seconds if quiz has started (catches missed socket events)
    useEffect(() => {
        const waitingStates = ['waiting', 'draft', 'scheduled'];
        if (!waitingStates.includes(status) || !quizId) return;

        const pollInterval = setInterval(async () => {
            try {
                const response = await quizAPI.getById(quizId);
                const data = response.data.data.quiz;
                if (['active', 'live', 'question_active'].includes(data.status)) {
                    console.log('🟢 [POLL] Quiz started detected via poll!');
                    setStatus(data.status);
                    setQuestions(data.questions || []);
                    if (data.expiresAt) {
                        const diff = (new Date(data.expiresAt).getTime() - getServerTime()) / 1000;
                        const secs = Math.max(0, Math.floor(diff));
                        setTimeLeft(secs);
                        setQuizTimeLeft(secs);
                    }
                    toast.success('🚀 Quiz has started! Good luck!');
                    clearInterval(pollInterval);
                }
            } catch (e) { /* silent fail, retry next tick */ }
        }, 15000);

        return () => clearInterval(pollInterval);
    }, [status, quizId, getServerTime]);

    // --- Scheduled countdown ticker (updates every second) ---
    useEffect(() => {
        if (status !== 'scheduled' || !quiz?.scheduledAt) return;
        const ticker = setInterval(() => {
            const diff = new Date(quiz.scheduledAt) - new Date();
            if (diff <= 0) {
                clearInterval(ticker);
                return;
            }
            // Force re-render to update countdown display
            setScheduledCountdown(diff);
        }, 1000);
        return () => clearInterval(ticker);
    }, [status, quiz?.scheduledAt]);

    // --- Persist answers to IndexedDB for offline multimedia recovery ---
    useEffect(() => {
        if (quizId && Object.keys(answers).length > 0) {
            localforage.setItem(`quiz_answers_${quizId}`, answers).catch(() => {});
        }

        // Cleanup storage when quiz is done
        if (['done', 'finished', 'completed'].includes(status)) {
            localforage.removeItem(`quiz_answers_${quizId}`);
        }
    }, [answers, quizId, status]);

    // --- Security Enforcements: Blur, Tab Switch, Fullscreen ---
    useEffect(() => {
        if (!socket || !quizId) return;

        const enforceSecurityViolation = (type) => {
            if (['active', 'question_active', 'live'].includes(status)) {
                console.warn(`🛡️ [SECURITY] Violation detected: ${type}`);
                socket.emit('tab:switched', { quizId }); // Server natively parses as strike
            }
        };

        const handleVisibilityChange = () => { if (document.hidden) enforceSecurityViolation('Tab Switch'); };
        const handleBlur = () => { enforceSecurityViolation('Window Blur'); };
        const handleFullscreenChange = () => { if (!document.fullscreenElement) enforceSecurityViolation('Exited Fullscreen'); };

        const handleSecurityWarning = (data) => {
            toast.error(data.message, { duration: 4000, icon: '⚠️', position: 'top-center' });
        };

        const handleTermination = (data) => {
            toast.error(data.message || 'You have been removed from this quiz.', { duration: 8000, icon: '🚫', position: 'top-center' });
            setStatus('done');
            setTimeout(() => navigate('/dashboard'), 3000);
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleBlur);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        
        socket.on('security:warning', handleSecurityWarning);
        socket.on('quiz:terminated', handleTermination);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('blur', handleBlur);
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            socket.off('security:warning', handleSecurityWarning);
            socket.off('quiz:terminated', handleTermination);
        };
    }, [socket, quizId, status, navigate]);

    // Per-question timer logic
    useEffect(() => {
        const qId = questions[currentIndex]?._id;
        const hasAnswer = !!answers[qId];
        if (status !== 'question_active' || timeLeft <= 0 || hasAnswer) return;
        timerRef.current = setInterval(() => {
            setTimeLeft(p => p > 0 ? p - 1 : 0);
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, [status, timeLeft, currentIndex, questions, answers]);

    // Overall quiz timer - counts down total quiz duration
    useEffect(() => {
        const activeStates = ['active', 'question_active', 'live', 'leaderboard'];
        if (!activeStates.includes(status) || quizTimeLeft <= 0) return;
        quizTimerRef.current = setInterval(() => {
            setQuizTimeLeft(p => {
                if (p <= 1) {
                    clearInterval(quizTimerRef.current);
                    return 0;
                }
                return p - 1;
            });
        }, 1000);
        return () => clearInterval(quizTimerRef.current);
    }, [status, quizTimeLeft > 0]);

    // Auto-submit when quiz timer reaches 0
    useEffect(() => {
        const activeStates = ['active', 'question_active', 'live'];
        if (quizTimeLeft === 0 && activeStates.includes(status) && !autoSubmittedRef.current) {
            autoSubmittedRef.current = true;
            toast('⏰ Time\'s up! Auto-submitting your quiz...', { icon: '⏰', duration: 3000 });

            // Auto-submit all answers
            const doAutoSubmit = async () => {
                try {
                    const res = await responseAPI.completeQuiz({ quizId, answers });
                    const rId = res?.data?.data?.responseId || res?.data?.responseId || responseId;
                    if (rId) setResponseId(rId);

                    if (socket && connected) {
                        socket.emit('quiz:complete', { quizId, answers });
                    }
                    localforage.removeItem(`quiz_answers_${quizId}`);
                    setStatus('done');

                    // Auto-redirect to results after 3 seconds
                    setTimeout(() => {
                        if (rId) {
                            navigate(`/history/report/${rId}`);
                        } else {
                            navigate('/dashboard');
                        }
                    }, 3000);
                } catch (err) {
                    console.error('Auto-submit error:', err);
                    setStatus('done');
                }
            };
            doAutoSubmit();
        }
    }, [quizTimeLeft, status]);

    // Join/Leave
    useEffect(() => {
        if (socket && quizId) {
            joinQuiz(quizId);
            return () => leaveQuiz(quizId);
        }
    }, [socket, quizId, joinQuiz, leaveQuiz]);

    const handleSelect = (questionId, option) => {
        const isActive = ['active', 'question_active', 'live', 'draft', 'waiting'].includes(status);
        if (!isActive || isSubmitting || !connected) return;

        // 1. Update Centralized State (Auto-Persists via useEffect)
        setAnswers(prev => ({
            ...prev,
            [questionId]: option
        }));

        // 2. Immediate emit for live dashboard tracking
        socket.emit('answer:submit', {
            quizId,
            questionId,
            answer: option,
            timeTaken: getServerTime() - questionStartTimeRef.current
        });
    };

    const handleTextUpdate = (questionId, text) => {
        setLocalTextAnswer(text);
        setAnswers(prev => ({
            ...prev,
            [questionId]: text
        }));
    };

    const handleAnswerSubmit = () => {
        const currentQ = questions[currentIndex];
        if (!currentQ) return;
        const answer = answers[currentQ._id];
        if (!answer) return;

        socket.emit('answer:submit', {
            quizId,
            questionId: currentQ._id,
            answer,
            timeTaken: getServerTime() - questionStartTimeRef.current
        });
    };

    const goToQuestion = (idx) => {
        if (idx < 0 || idx >= questions.length || !isDataReady) return;
        setCurrentIndex(idx);
        questionStartTimeRef.current = getServerTime();
        // Sync local text answer for the new question
        const qId = questions[idx]?._id;
        setLocalTextAnswer(answers[qId] || '');
    };

    const handleFinalSubmit = async () => {
        if (!window.confirm('Are you sure you want to finalize and submit all answers?')) return;
        try {
            setLoading(true);
            // 🚀 1. Call API with FULL answers object (Architecture Fix)
            await responseAPI.completeQuiz({
                quizId,
                answers // Sending the centralized object
            });

            // 🚀 2. Signal server via socket with FULL answers for real-time safety
            if (socket && connected) {
                socket.emit('quiz:complete', {
                    quizId,
                    answers
                });
            }

            // Clear local storage after successful submit
            localStorage.removeItem(`quiz_answers_${quizId}`);
            toast.success('Quiz submitted successfully!');
        } catch (error) {
            console.error('Final submit failed:', error);
            toast.error('Submission failed. Check your connection.');
        } finally {
            setLoading(false);
            setIsSubmitting(false);
        }
    };

    const [isFullscreenMode, setIsFullscreenMode] = useState(false);

    useEffect(() => {
        const handleFS = () => setIsFullscreenMode(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFS);
        return () => document.removeEventListener('fullscreenchange', handleFS);
    }, []);

    if (loading) return <div className="quiz-loading-modern"><div className="loader-orbit"></div><p>Syncing Arena...</p></div>;

    if (!isFullscreenMode && ['active', 'question_active', 'live'].includes(status)) {
        return (
            <div className="quiz-waiting-modern">
                <div className="waiting-glass-card animate-fadeInUp" style={{ borderTop: '4px solid var(--danger)' }}>
                    <div className="pulse-logo icon icon-xl text-danger"><FiInfo /></div>
                    <h1 className="text-danger">Fullscreen Required</h1>
                    <p>This exam operates in strict secure mode. You must enter Fullscreen to reveal the questions and continue.</p>
                    <button 
                        className="btn btn-primary pulse-button" 
                        style={{ marginTop: '2rem' }}
                        onClick={() => document.documentElement.requestFullscreen().catch(() => toast.error('Failed to enter fullscreen'))}
                    >
                        ENTER EXAM SECURE MODE
                    </button>
                </div>
            </div>
        );
    }

    if (['waiting', 'draft', 'scheduled'].includes(status)) {
        const isScheduled = status === 'scheduled' && quiz?.scheduledAt;
        return (
            <div className="quiz-waiting-modern">
                <div className="waiting-glass-card animate-fadeInUp">
                    <div className="pulse-logo"><FiZap className="zap-icon" /></div>
                    <h1>Ready for Battle?</h1>
                    <p>{isScheduled ? 'This quiz is scheduled to start automatically.' : 'The host is preparing the arena. Stay sharp.'}</p>

                    {isScheduled && quiz?.scheduledAt && (() => {
                        const scheduledTime = new Date(quiz.scheduledAt);
                        const now = new Date();
                        const diff = scheduledTime - now;
                        if (diff > 0) {
                            const hrs  = Math.floor(diff / 3600000);
                            const mins = Math.floor((diff % 3600000) / 60000);
                            const secs = Math.floor((diff % 60000) / 1000);
                            return (
                                <div style={{ margin: '1rem 0', padding: '0.75rem 1.5rem', background: 'var(--bg-card-light)', borderRadius: '12px', border: '1px solid var(--accent)', color: 'var(--accent)', fontWeight: 700, fontSize: '1.1rem', letterSpacing: 1 }}>
                                    ⏰ Starts in: {hrs > 0 ? `${hrs}h ` : ''}{mins}m {secs}s
                                </div>
                            );
                        }
                        return <div className="text-success" style={{ fontWeight: 700, margin: '0.5rem 0' }}>🚀 Starting any moment now...</div>;
                    })()}

                    <div className="quiz-stats-banner">
                        <div className="stat-banner-item"><FiUsers /> <span>{participantCount || quiz?.participantCount || 0} Joined</span></div>
                        <div className="stat-banner-item"><FiZap /> <span>{questions.length} Items</span></div>
                    </div>

                    {/* Manual Sync / Refresh Button */}
                    <button
                        onClick={handleManualSync}
                        disabled={isSyncing}
                        style={{
                            marginTop: '1.5rem',
                            padding: '0.7rem 1.8rem',
                            background: isSyncing ? 'rgba(255,255,255,0.1)' : 'rgba(255,204,2,0.15)',
                            border: '1px solid rgba(255,204,2,0.4)',
                            borderRadius: '10px',
                            color: '#FFCC02',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            cursor: isSyncing ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            margin: '1.5rem auto 0'
                        }}
                    >
                        {isSyncing ? (
                            <><span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #FFCC02', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}></span> Syncing...</>
                        ) : (
                            <><FiClock /> Refresh / Check Status</>
                        )}
                    </button>
                    <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: '0.5rem', textAlign: 'center' }}>Auto-checks every 15 seconds</p>
                </div>
            </div>
        );
    }

    if (status === 'finished' || status === 'done') {
        return (
            <div className="quiz-finished-premium animate-fadeIn">
                <div className="results-hero-card">
                    <div className="hero-glow"></div>
                    <div className="victory-crown">🎉</div>
                    <h1 className="victory-title">Quiz Concluded!</h1>

                    <div className="glory-stats-grid">
                        <div className="glory-stat-card primary">
                            <FiZap />
                            <span className="stat-val">{score}</span>
                            <span className="stat-lbl">YOUR SCORE</span>
                        </div>
                        <div className="glory-stat-card gold">
                            <FiCheckCircle />
                            <span className="stat-val">{Object.keys(answers).length}/{questions.length}</span>
                            <span className="stat-lbl">ANSWERED</span>
                        </div>
                    </div>

                    <div className="action-buttons-stack">
                        {responseId ? (
                            <>
                                <button className="btn-premium primary pulse-button" onClick={() => navigate(`/history/report/${responseId}`)}>
                                    VIEW DETAILED ANALYTICS 📊
                                </button>
                                <p className="auto-redirect-hint">Report generated. Full analysis available.</p>
                            </>
                        ) : (
                            <div className="processing-report">
                                <div className="spinner-sm"></div>
                                <span>Generating your detailed report...</span>
                            </div>
                        )}
                        <button className="btn-premium secondary" onClick={() => navigate('/dashboard')}>EXIT TO DASHBOARD</button>
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
            <div 
                className={`play-quiz-game ${!connected ? 'socket-lost' : ''}`}
                onCopy={(e) => {
                    e.preventDefault();
                    toast.error("🚨 Cheating Warning: Copying exam content is strictly prohibited.");
                }}
                onContextMenu={(e) => e.preventDefault()}
            >
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
                                const qId = questions[i]?._id;
                                const isAns = !!answers[qId];
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
                            {quizTimeLeft > 0 && (
                                <div className={`stat-pill quiz-timer ${quizTimeLeft < 60 ? 'critical' : ''}`}>
                                    <FiClock /> {Math.floor(quizTimeLeft / 60)}:{String(quizTimeLeft % 60).padStart(2, '0')}
                                </div>
                            )}
                            <div className="stat-pill">Q{currentIndex + 1}/{questions.length}</div>
                        </div>
                    </div>

                    {/* Question Panel (Main Content) */}
                    <main className="question-play-arena">
                        <div className="question-card-interactive animate-fadeIn">
                            <div className="q-header">
                                <span className="q-index-tag">Question {currentIndex + 1} of {questions.length}</span>
                                <h2 className="q-text-display">{q?.text}</h2>
                            </div>

                            {/* ── Dynamic Timer Bar ── */}
                            {status === 'question_active' && timeLeft > 0 && (
                                <div className="dynamic-timer-bar-wrap">
                                    <div className="dynamic-timer-meta">
                                        <span style={{ color: timerColor, fontWeight: 700 }}>
                                            {timeLeft <= 5 ? '⚠️ ' : '⏱️ '}{timeLeft}s
                                        </span>
                                        <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                                            {q?.difficulty ? q.difficulty.toUpperCase() : ''}
                                        </span>
                                    </div>
                                    <div className="dynamic-timer-track">
                                        <div
                                            className="dynamic-timer-fill"
                                            style={{
                                                width: `${timerPercent}%`,
                                                background: timerColor,
                                                transition: 'width 1s linear, background 0.3s ease'
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="options-grid-container">
                                {(['mcq', 'msq'].includes(q?.type?.toLowerCase()) || (q?.options && q?.options.length > 0)) ? (
                                    <div className="mcq-options-layout">
                                        {q?.options?.map((opt, i) => {
                                            const isSelected = answers[q._id] === opt;
                                            const isActive = ['active', 'question_active', 'live', 'draft', 'waiting'].includes(status) && !isSubmitting && connected;
                                            return (
                                                <button
                                                    key={i}
                                                    className={`mcq-option-btn ${isSelected ? 'selected' : ''}`}
                                                    onClick={() => handleSelect(q._id, opt)}
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
                                                value={localTextAnswer}
                                                onChange={e => handleTextUpdate(q._id, e.target.value)}
                                                onBlur={handleAnswerSubmit}
                                                disabled={!['active', 'question_active', 'live', 'draft', 'waiting'].includes(status) || isSubmitting || !connected}
                                                onPaste={(e) => {
                                                    e.preventDefault();
                                                    toast.error("🚨 Cheating Warning: Pasting answers is prohibited. Violation recorded.");
                                                    if (quizId) responseAPI.reportTabSwitch({ quizId });
                                                }}
                                            />
                                        ) : (
                                            <input
                                                className="fill-blank-input"
                                                placeholder="Type the correct word..."
                                                value={localTextAnswer}
                                                onChange={e => handleTextUpdate(q._id, e.target.value)}
                                                onBlur={handleAnswerSubmit}
                                                disabled={!['active', 'question_active', 'live', 'draft', 'waiting'].includes(status) || isSubmitting || !connected}
                                                onPaste={(e) => {
                                                    e.preventDefault();
                                                    toast.error("🚨 Cheating Warning: Pasting answers is prohibited. Violation recorded.");
                                                    if (quizId) responseAPI.reportTabSwitch({ quizId });
                                                }}
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
