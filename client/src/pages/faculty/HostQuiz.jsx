import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiCopy, FiUsers, FiPlay, FiStopCircle, FiChevronRight, FiAward, FiClock, FiCheck, FiBarChart2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useSocket } from '../../context/SocketContext';
import { quizAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import './HostQuiz.css';

const HostQuiz = () => {
    const { quizId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { socket, nextQuestion } = useSocket();

    const [quiz, setQuiz] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [status, setStatus] = useState('loading'); // loading, ready, active, completed
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answeredCount, setAnsweredCount] = useState(0);
    const [leaderboard, setLeaderboard] = useState([]);
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [answeredParticipants, setAnsweredParticipants] = useState([]);

    useEffect(() => {
        if (user && user.role === 'student') {
            console.log("Student detected on host page, redirecting to play page.");
            navigate(`/quiz/${quizId}/play`);
            return;
        }

        const fetchQuiz = async () => {
            try {
                const response = await quizAPI.getById(quizId);
                const data = response.data.data.quiz;
                setQuiz(data);
                setParticipants(Array.isArray(data.participants) ? data.participants : []);
                setStatus(data.status === 'active' ? 'active' : 'ready');
                if (data.currentQuestionIndex >= 0) {
                    setCurrentQuestionIndex(data.currentQuestionIndex);
                }
            } catch (error) {
                console.error("Fetch error:", error);
                if (error.response?.status === 403) {
                    toast.error('You are not authorized to host this quiz');
                    navigate('/dashboard');
                } else {
                    toast.error('Failed to load quiz');
                    navigate('/dashboard');
                }
            }
        };
        fetchQuiz();
    }, [quizId, navigate, user]);

    // Socket listener for events
    useEffect(() => {
        if (!socket || !quizId) return;

        socket.emit('quiz:join', { quizId });

        const handleQuizJoined = (data) => {
            console.log("Quiz joined event received with participants:", data.participants);
            // Set initial participants from students who have already joined
            const joinedParticipants = data.participants || [];
            setParticipants(joinedParticipants);
        };

        const handleParticipantJoined = (data) => {
            console.log("Participant joined event received:", data);
            setParticipants(prev => {
                // Safely compare IDs as strings to handle potential ObjectId/String mismatches
                const participantId = data.participant?.id;
                if (prev.find(p => String(p._id || p.id) === String(participantId))) {
                    console.log("Participant already in list:", data.participant?.name);
                    return prev;
                }
                console.log("Adding new participant:", data.participant?.name);
                return [...prev, {
                    _id: participantId,
                    id: participantId,
                    name: data.participant?.name || 'Student',
                    avatar: data.participant?.avatar
                }];
            });
            toast.success(`${data.participant?.name || 'A student'} joined!`, { icon: '👋' });
        };

        const handleQuizStarted = () => {
            setStatus('active');
            setCurrentQuestionIndex(0);
            setShowLeaderboard(false);
        };

        const handleResponseReceived = (data) => {
            console.log("Response received from:", data.participantName);
            setAnsweredCount(prev => prev + 1);
            setAnsweredParticipants(prev => [...new Set([...prev, data.participantId])]);
            toast.success(`${data.participantName} answered!`, { id: data.participantId, duration: 2000 });
        };

        const handleLeaderboardUpdate = (data) => {
            setLeaderboard(data.leaderboard || []);
        };

        const handleQuizEnded = (data) => {
            setStatus('completed');
            setLeaderboard(data.leaderboard || []);
            setShowLeaderboard(true);
        };

        socket.on('quiz:joined', handleQuizJoined);
        socket.on('participant:joined', handleParticipantJoined);
        socket.on('quiz:started', handleQuizStarted);
        socket.on('response:received', handleResponseReceived);
        socket.on('leaderboard:update', handleLeaderboardUpdate);
        socket.on('quiz:ended', handleQuizEnded);

        return () => {
            socket.off('quiz:joined', handleQuizJoined);
            socket.off('participant:joined', handleParticipantJoined);
            socket.off('quiz:started', handleQuizStarted);
            socket.off('response:received', handleResponseReceived);
            socket.off('leaderboard:update', handleLeaderboardUpdate);
            socket.off('quiz:ended', handleQuizEnded);
        };
    }, [socket, quizId]);

    const handleStartQuiz = async () => {
        if (participants.length === 0) {
            if (!window.confirm("No students have joined yet. Are you sure you want to start the quiz?")) {
                return;
            }
        }
        try {
            await quizAPI.start(quizId);
            setStatus('active');
            setCurrentQuestionIndex(0);
            toast.success('Quiz Started!', { icon: '🚀' });
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to start quiz');
        }
    };

    const handleNextQuestion = useCallback(() => {
        if (currentQuestionIndex < (quiz?.questions?.length || 0) - 1) {
            nextQuestion(quizId);
            setCurrentQuestionIndex(prev => prev + 1);
            setAnsweredCount(0);
            setAnsweredParticipants([]);
            setShowLeaderboard(false);
        } else {
            setShowLeaderboard(true);
        }
    }, [currentQuestionIndex, quiz, quizId, nextQuestion]);

    const handleShowLeaderboard = () => {
        setShowLeaderboard(true);
    };

    const handleEndQuiz = async () => {
        try {
            await quizAPI.end(quizId);
            setStatus('completed');
            toast.success('Quiz Ended!');
        } catch (error) {
            toast.error('Failed to end quiz');
        }
    };

    const copyCode = () => {
        if (quiz?.code) {
            navigator.clipboard.writeText(quiz.code);
            toast.success('PIN copied!');
        }
    };

    if (!quiz) return (
        <div className="host-quiz-page">
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading Quiz Lobby...</p>
            </div>
        </div>
    );

    const currentQuestion = quiz.questions?.[currentQuestionIndex];
    const totalQuestions = quiz.questions?.length || 0;

    // Completed/Leaderboard View
    if (status === 'completed' || (showLeaderboard && leaderboard.length > 0)) {
        return (
            <div className="host-quiz-page">
                <div className="host-completed">
                    <div className="completed-header">
                        <h1>🏆 Final Leaderboard</h1>
                        <p>{quiz.title}</p>
                    </div>

                    <div className="leaderboard-podium">
                        {leaderboard.slice(0, 3).map((entry, index) => (
                            <div key={entry.studentId} className={`podium-item rank-${index + 1}`}>
                                <div className="podium-medal">
                                    {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                                </div>
                                <div className="podium-name">{entry.studentName}</div>
                                <div className="podium-score">{entry.score} pts</div>
                            </div>
                        ))}
                    </div>

                    <div className="leaderboard-full">
                        {leaderboard.slice(3).map((entry, index) => (
                            <div key={entry.studentId} className="leaderboard-row">
                                <span className="lb-rank">#{index + 4}</span>
                                <span className="lb-name">{entry.studentName}</span>
                                <span className="lb-score">{entry.score} pts</span>
                            </div>
                        ))}
                    </div>

                    <div className="completed-actions">
                        <button className="btn btn-secondary btn-lg" onClick={() => navigate(`/quiz/${quiz._id}/results`)}>
                            <FiBarChart2 /> View Detailed Results
                        </button>
                        <button className="btn btn-primary btn-lg" onClick={() => navigate('/dashboard')}>
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Active Quiz View
    if (status === 'active') {
        return (
            <div className="host-quiz-page">
                <div className="host-active">
                    {/* Header */}
                    <div className="active-header">
                        <div className="quiz-progress">
                            <span>Question {currentQuestionIndex + 1} of {totalQuestions}</span>
                            <div className="progress-bar">
                                <div
                                    className="progress-fill"
                                    style={{ width: `${((currentQuestionIndex + 1) / totalQuestions) * 100}%` }}
                                />
                            </div>
                        </div>
                        <div className="live-badge">
                            <span className="live-dot"></span> LIVE
                        </div>
                        <div className="participants-count">
                            <FiUsers /> {participants.length}
                        </div>
                    </div>

                    {/* Current Question Display */}
                    <div className="question-display">
                        <div className="question-card-host">
                            <div className="question-meta">
                                <span className={`difficulty ${currentQuestion?.difficulty || 'medium'}`}>
                                    {currentQuestion?.difficulty || 'Medium'}
                                </span>
                                <span className="points">{currentQuestion?.points || 10} pts</span>
                                <span className="q-type">{currentQuestion?.type?.toUpperCase() || 'MCQ'}</span>
                            </div>
                            <h2 className="question-text-host">{currentQuestion?.text || 'Loading question...'}</h2>

                            {currentQuestion?.type === 'mcq' && currentQuestion?.options && (
                                <div className="options-display">
                                    {currentQuestion.options.map((option, idx) => (
                                        <div key={idx} className={`option-display opt-${idx}`}>
                                            <span className="option-letter">{String.fromCharCode(65 + idx)}</span>
                                            <span className="option-text">{option}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Response Stats */}
                    <div className="response-stats">
                        <div className="stat-card">
                            <FiCheck className="stat-icon" />
                            <div className="stat-value">{answeredCount}</div>
                            <div className="stat-label">Answered</div>
                        </div>
                        <div className="stat-card">
                            <FiClock className="stat-icon" />
                            <div className="stat-value">{participants.length - answeredCount}</div>
                            <div className="stat-label">Waiting</div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="active-actions">
                        {currentQuestionIndex < totalQuestions - 1 ? (
                            <button className="btn btn-primary btn-lg" onClick={handleNextQuestion}>
                                Next Question <FiChevronRight />
                            </button>
                        ) : (
                            <button className="btn btn-success btn-lg" onClick={handleShowLeaderboard}>
                                <FiAward /> Show Results
                            </button>
                        )}
                        <button className="btn btn-danger" onClick={handleEndQuiz}>
                            <FiStopCircle /> End Quiz
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Lobby/Waiting View
    return (
        <div className="host-quiz-page">
            <div className="host-lobby">
                {/* Quiz Title */}
                <div className="lobby-header">
                    <h1>{quiz.title}</h1>
                    <p>{quiz.description || 'Get ready to play!'}</p>
                </div>

                {/* PIN Display */}
                <div className="pin-container" onClick={copyCode}>
                    <div className="pin-label">Join at: <strong>quizmaster.app</strong></div>
                    <div className="pin-box">
                        <span className="pin-title">Game PIN:</span>
                        <span className="pin-code">{quiz.code}</span>
                        <FiCopy className="copy-icon" />
                    </div>
                </div>

                {/* Participants Grid */}
                <div className="lobby-content">
                    <div className="lobby-status-bar">
                        <div className="player-count">
                            <FiUsers />
                            <span className="count-number">{participants.length}</span>
                            <span>Player{participants.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="status-indicator">
                            <span className="status-dot waiting"></span>
                            WAITING FOR PLAYERS
                        </div>
                    </div>

                    <div className="participants-area">
                        {participants.length > 0 ? (
                            <div className="participants-list">
                                {participants.map((p, idx) => (
                                    <div
                                        key={p.id || p._id || idx}
                                        className={`participant-card ${answeredParticipants.includes(p.id || p._id) ? 'answered' : ''}`}
                                        style={{ animationDelay: `${idx * 0.1}s` }}
                                    >
                                        <div className="participant-avatar">
                                            {answeredParticipants.includes(p.id || p._id) ? <FiCheck /> : (p.name?.charAt(0)?.toUpperCase() || '?')}
                                        </div>
                                        <span className="participant-name">{p.name || 'Student'}</span>
                                        {answeredParticipants.includes(p.id || p._id) && <span className="answered-badge">Ready</span>}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-lobby">
                                <div className="empty-icon">👥</div>
                                <h3>Waiting for players...</h3>
                                <p>Share the Game PIN with your students to get started</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Start Button */}
                <div className="lobby-actions">
                    <button
                        className="btn btn-primary btn-xl start-btn"
                        onClick={handleStartQuiz}
                    >
                        <FiPlay /> Start Quiz
                    </button>
                    {participants.length === 0 && (
                        <p className="start-hint">Wait for at least 1 player to join</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HostQuiz;
