import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { quizAPI, responseAPI } from '../../services/api';
import {
    FiClock,
    FiCheckCircle,
    FiXCircle,
    FiAward,
    FiUsers,
    FiTrendingUp,
    FiAlertTriangle,
    FiArrowLeft
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import './PlayQuiz.css';

const PlayQuiz = () => {
    const { quizId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { socket, joinQuiz, leaveQuiz, submitAnswer, reportTabSwitch, on, off } = useSocket();

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

    // Timer State
    const [timeLeft, setTimeLeft] = useState(0);
    const timerRef = useRef(null);

    // Score State
    const [score, setScore] = useState(0);
    const [totalPoints, setTotalPoints] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);

    // Leaderboard State
    const [leaderboard, setLeaderboard] = useState([]);
    const [showLeaderboard, setShowLeaderboard] = useState(false);

    // Tab Switch State
    const [tabSwitchCount, setTabSwitchCount] = useState(0);
    const [showTabWarning, setShowTabWarning] = useState(false);

    // Review State
    const [reviewMode, setReviewMode] = useState(false);
    const [reviewData, setReviewData] = useState(null);

    const handleViewReview = async () => {
        try {
            setLoading(true);
            const response = await responseAPI.getMyResponse(quizId);
            setReviewData(response.data.data.response);
            setReviewMode(true);
            setLoading(false);
        } catch (error) {
            console.error('Failed to load review:', error);
            toast.error('Failed to load review');
            setLoading(false);
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
                setStatus(quizData.status === 'active' ? 'active' : 'waiting');

                if (quizData.status === 'active') {
                    setCurrentIndex(quizData.currentQuestionIndex >= 0 ? quizData.currentQuestionIndex : 0);
                    setTimeLeft(quizData.settings?.questionTimer || 30);
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
    }, [quizId, navigate]);

    // Join quiz room
    useEffect(() => {
        if (socket && quizId) {
            console.log('Attempting to join quiz room:', quizId);
            joinQuiz(quizId);

            // Set up a timeout to check if we actually joined or received data
            const connectionTimeout = setTimeout(() => {
                if (status === 'waiting' && !socket.connected) {
                    setConnectionError(true);
                    toast.error('Connection issue detected. Trying to reconnect...');
                }
            }, 5000);

            return () => {
                clearTimeout(connectionTimeout);
                leaveQuiz(quizId);
            };
        }
    }, [socket, quizId, joinQuiz, leaveQuiz, status]);

    // Socket event listeners
    useEffect(() => {
        if (!socket) return;

        const handleQuizStart = (data) => {
            setStatus('active');
            setQuestions(data.questions || questions);
            setCurrentIndex(0);
            setTimeLeft(data.questionTimer || 30);
            toast.success('Quiz has started!');
        };

        const handleQuestionUpdate = (data) => {
            setCurrentIndex(data.questionIndex);
            setSelectedAnswer('');
            setTextAnswer('');
            setIsAnswered(false);
            setFeedback(null);
            setTimeLeft(data.timeLimit || quiz?.settings?.questionTimer || 30);
        };

        const handleAnswerFeedback = (data) => {
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
            setStatus('completed');
            setLeaderboard(data.leaderboard || []);
            setShowLeaderboard(true);
            clearInterval(timerRef.current);
        };

        const cleanups = [
            on('quiz:started', handleQuizStart),
            on('quiz:question', handleQuestionUpdate),
            on('answer:feedback', handleAnswerFeedback),
            on('leaderboard:update', handleLeaderboardUpdate),
            on('quiz:ended', handleQuizEnd)
        ];

        return () => cleanups.forEach(cleanup => cleanup && cleanup());
    }, [socket, on, questions, quiz]);

    // Timer countdown
    useEffect(() => {
        if (status !== 'active' || timeLeft <= 0) return;

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    if (!isAnswered) {
                        handleAnswerSubmit(true); // Auto-submit on timeout
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timerRef.current);
    }, [status, currentIndex]);

    // Tab visibility detection
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && status === 'active' && !quiz?.settings?.allowTabSwitch) {
                setTabSwitchCount(prev => prev + 1);
                setShowTabWarning(true);
                reportTabSwitch(quizId);

                if (quiz?.settings?.maxTabSwitches && tabSwitchCount >= quiz.settings.maxTabSwitches) {
                    toast.error('Quiz terminated due to tab switching');
                    setStatus('completed');
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [status, quiz, tabSwitchCount, reportTabSwitch, quizId]);

    const handleAnswerSubmit = useCallback(async (isTimeout = false) => {
        if (isAnswered || status !== 'active') return;

        const currentQuestion = questions[currentIndex];
        const answer = currentQuestion?.type === 'mcq' ? selectedAnswer : textAnswer;

        if (!answer && !isTimeout) {
            toast.error('Please select an answer');
            return;
        }

        setIsAnswered(true);
        clearInterval(timerRef.current);

        try {
            submitAnswer({
                quizId,
                questionId: currentQuestion?._id,
                answer: answer || '',
                timeTaken: ((currentQuestion?.timeLimit || quiz?.settings?.questionTimer || 30) - timeLeft) * 1000
            });
        } catch (error) {
            console.error('Failed to submit answer:', error);
        }
    }, [isAnswered, status, questions, currentIndex, selectedAnswer, textAnswer, timeLeft, submitAnswer, quizId, quiz]);

    const handleNextQuestion = useCallback(() => {
        if (currentIndex < questions.length - 1) {
            const nextIndex = currentIndex + 1;
            setCurrentIndex(nextIndex);
            setSelectedAnswer('');
            setTextAnswer('');
            setIsAnswered(false);
            setFeedback(null);
            setTimeLeft(questions[nextIndex]?.timeLimit || quiz?.settings?.questionTimer || 30);
        } else {
            // Quiz completed
            setStatus('completed');
            setShowLeaderboard(true);
        }
    }, [currentIndex, questions, quiz]);

    const getTimerClass = () => {
        if (timeLeft <= 5) return 'danger';
        if (timeLeft <= 10) return 'warning';
        return 'normal';
    };

    if (loading) {
        return (
            <div className="quiz-loading">
                <div className="spinner"></div>
                <p>Loading quiz...</p>
            </div>
        );
    }

    if (connectionError && !socket?.connected) {
        return (
            <div className="quiz-error">
                <div className="error-content">
                    <FiAlertTriangle className="error-icon" />
                    <h2>Connection Lost</h2>
                    <p>We're having trouble connecting to the quiz server.</p>
                    <button className="btn btn-primary" onClick={() => window.location.reload()}>
                        Refresh Page
                    </button>
                </div>
            </div>
        );
    }

    // Waiting Screen
    if (status === 'waiting') {
        return (
            <div className="quiz-waiting">
                <div className="waiting-card animate-slideUp">
                    <div className="waiting-icon animate-bounce">⏳</div>
                    <h1>Waiting for Quiz to Start</h1>
                    <p>The instructor will start the quiz shortly</p>

                    <div className="quiz-info">
                        <h2>{quiz?.title}</h2>
                        <p>{quiz?.description}</p>
                        <div className="quiz-meta">
                            <span><FiUsers /> {quiz?.participants?.length || 0} participants</span>
                            <span><FiClock /> {questions.length} questions</span>
                        </div>
                    </div>

                    <div className="waiting-tips">
                        <h3>While you wait:</h3>
                        <ul>
                            <li>Stay on this page</li>
                            <li>Ensure stable internet connection</li>
                            <li>Get ready to answer quickly!</li>
                        </ul>
                    </div>
                </div>
            </div>
        );
    }

    // Completed Screen
    if (status === 'completed' || showLeaderboard) {
        if (reviewMode && reviewData) {
            return (
                <div className="play-quiz review-mode">
                    <div className="review-container animate-slideUp">
                        <div className="review-header">
                            <button className="btn btn-ghost" onClick={() => setReviewMode(false)}>
                                <FiArrowLeft /> Back to Summary
                            </button>
                            <h1>Review Answers</h1>
                        </div>

                        <div className="review-list">
                            {reviewData.quizId?.questions?.map((q, qIdx) => {
                                const answer = reviewData.answers.find(a => a.questionId === q._id);
                                const isCorrect = answer?.isCorrect;

                                return (
                                    <div key={q._id} className={`review-card ${isCorrect ? 'correct' : 'incorrect'}`}>
                                        <div className="review-card-header">
                                            <span className="q-num">Q{qIdx + 1}</span>
                                            <span className={`status ${isCorrect ? 'correct' : 'incorrect'}`}>
                                                {isCorrect ? <FiCheckCircle /> : <FiXCircle />}
                                                {isCorrect ? 'Correct' : 'Incorrect'}
                                            </span>
                                            <span className="points">{answer?.pointsEarned || 0}/{q.points} pts</span>
                                        </div>
                                        <p className="q-text">{q.text}</p>

                                        <div className="review-details">
                                            <div className="review-answer user">
                                                <span className="label">Your Answer:</span>
                                                <span className="value">{answer?.answer || '(No answer)'}</span>
                                            </div>
                                            {!isCorrect && (
                                                <div className="review-answer correct">
                                                    <span className="label">Correct Answer:</span>
                                                    <span className="value">{q.correctAnswer}</span>
                                                </div>
                                            )}
                                        </div>
                                        {q.explanation && (
                                            <div className="review-explanation">
                                                <strong>Explanation:</strong> {q.explanation}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            );
        }
        const userRank = leaderboard.findIndex(l => l.studentId === user?._id) + 1;
        const percentage = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

        return (
            <div className="quiz-completed">
                <div className="completed-card animate-slideUp">
                    <div className="completed-header">
                        <div className={`result-icon ${percentage >= 70 ? 'success' : percentage >= 40 ? 'warning' : 'danger'}`}>
                            {percentage >= 70 ? '🎉' : percentage >= 40 ? '👍' : '💪'}
                        </div>
                        <h1>Quiz Completed!</h1>
                        <p>{quiz?.title}</p>
                    </div>

                    <div className="score-summary">
                        <div className="score-item primary">
                            <span className="score-value">{score}</span>
                            <span className="score-label">Points</span>
                        </div>
                        <div className="score-item success">
                            <span className="score-value">{correctCount}/{questions.length}</span>
                            <span className="score-label">Correct</span>
                        </div>
                        <div className="score-item accent">
                            <span className="score-value">{percentage}%</span>
                            <span className="score-label">Score</span>
                        </div>
                        {userRank > 0 && (
                            <div className="score-item info">
                                <span className="score-value">#{userRank}</span>
                                <span className="score-label">Rank</span>
                            </div>
                        )}
                    </div>

                    {leaderboard.length > 0 && (
                        <div className="final-leaderboard">
                            <h2><FiAward /> Leaderboard</h2>
                            <div className="leaderboard-list">
                                {leaderboard.slice(0, 10).map((entry, index) => (
                                    <div
                                        key={entry.studentId}
                                        className={`leaderboard-item ${entry.studentId === user?._id ? 'current-user' : ''}`}
                                    >
                                        <span className={`rank ${index < 3 ? `top-${index + 1}` : ''}`}>
                                            {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                                        </span>
                                        <span className="name">{entry.studentName}</span>
                                        <span className="points">{entry.score} pts</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="completed-actions">
                        <button className="btn btn-secondary btn-lg" onClick={handleViewReview}>
                            <FiCheckCircle /> Review Answers
                        </button>
                        <button
                            className="btn btn-primary btn-lg"
                            onClick={() => navigate('/dashboard')}
                        >
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Active Quiz Screen
    const currentQuestion = questions[currentIndex];

    return (
        <div className="play-quiz">
            {/* Tab Switch Warning Modal */}
            {showTabWarning && (
                <div className="warning-modal">
                    <div className="warning-content">
                        <FiAlertTriangle className="warning-icon" />
                        <h2>Tab Switch Detected!</h2>
                        <p>Switching tabs is not allowed during the quiz.</p>
                        <p className="warning-count">Warning {tabSwitchCount}/{quiz?.settings?.maxTabSwitches || '∞'}</p>
                        <button
                            className="btn btn-primary"
                            onClick={() => setShowTabWarning(false)}
                        >
                            Continue Quiz
                        </button>
                    </div>
                </div>
            )}

            {/* Quiz Header */}
            <div className="quiz-header">
                <div className="quiz-progress">
                    <span className="question-count">
                        Question {currentIndex + 1}/{questions.length}
                    </span>
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                        ></div>
                    </div>
                </div>

                <div className={`quiz-timer ${getTimerClass()}`}>
                    <FiClock />
                    <span>{timeLeft}s</span>
                </div>

                <div className="quiz-score">
                    <FiTrendingUp />
                    <span>{score} pts</span>
                </div>
            </div>

            {/* Question Card */}
            <div className="question-card animate-slideUp" key={currentIndex}>
                <div className="question-header">
                    <span className={`difficulty ${currentQuestion?.difficulty}`}>
                        {currentQuestion?.difficulty}
                    </span>
                    <span className="points">{currentQuestion?.points} points</span>
                </div>

                <h2 className="question-text">{currentQuestion?.text}</h2>

                {/* MCQ Options */}
                {currentQuestion?.type === 'mcq' && (
                    <div className="options-grid">
                        {currentQuestion?.options?.map((option, index) => (
                            <button
                                key={index}
                                className={`option-btn ${selectedAnswer === option ? 'selected' : ''} 
                  ${isAnswered && feedback?.correctAnswer === option ? 'correct' : ''} 
                  ${isAnswered && selectedAnswer === option && !feedback?.isCorrect ? 'incorrect' : ''}`}
                                onClick={() => !isAnswered && setSelectedAnswer(option)}
                                disabled={isAnswered}
                            >
                                <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                                <span className="option-text">{option}</span>
                                {isAnswered && feedback?.correctAnswer === option && (
                                    <FiCheckCircle className="option-icon correct" />
                                )}
                                {isAnswered && selectedAnswer === option && !feedback?.isCorrect && (
                                    <FiXCircle className="option-icon incorrect" />
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {/* Text Answer */}
                {(currentQuestion?.type === 'fill-blank' || currentQuestion?.type === 'qa') && (
                    <div className="text-answer">
                        <input
                            type="text"
                            className="form-input answer-input"
                            placeholder="Type your answer..."
                            value={textAnswer}
                            onChange={(e) => setTextAnswer(e.target.value)}
                            disabled={isAnswered}
                            autoFocus
                        />
                        {isAnswered && feedback && (
                            <div className={`answer-feedback ${feedback.isCorrect ? 'correct' : 'incorrect'}`}>
                                {feedback.isCorrect ? (
                                    <><FiCheckCircle /> Correct!</>
                                ) : (
                                    <><FiXCircle /> Incorrect. Answer: {feedback.correctAnswer}</>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Submit / Next Button */}
                <div className="question-actions">
                    {!isAnswered ? (
                        <button
                            className="btn btn-primary btn-lg submit-btn"
                            onClick={() => handleAnswerSubmit()}
                            disabled={currentQuestion?.type === 'mcq' ? !selectedAnswer : !textAnswer}
                        >
                            Submit Answer
                        </button>
                    ) : (
                        <button
                            className="btn btn-primary btn-lg next-btn"
                            onClick={handleNextQuestion}
                        >
                            {currentIndex < questions.length - 1 ? 'Next Question' : 'Finish Quiz'}
                        </button>
                    )}
                </div>

                {/* Feedback */}
                {isAnswered && feedback && quiz?.settings?.showInstantFeedback && (
                    <div className={`feedback-card ${feedback.isCorrect ? 'correct' : 'incorrect'}`}>
                        <div className="feedback-header">
                            {feedback.isCorrect ? (
                                <>
                                    <FiCheckCircle className="feedback-icon" />
                                    <span>Correct! +{feedback.pointsEarned} points</span>
                                </>
                            ) : (
                                <>
                                    <FiXCircle className="feedback-icon" />
                                    <span>Incorrect</span>
                                </>
                            )}
                        </div>
                        {currentQuestion?.explanation && (
                            <p className="explanation">{currentQuestion.explanation}</p>
                        )}
                    </div>
                )}
            </div>

            {/* Mini Leaderboard */}
            {quiz?.settings?.showLeaderboard && leaderboard.length > 0 && (
                <div className="mini-leaderboard">
                    <h3><FiAward /> Top 5</h3>
                    <div className="mini-list">
                        {leaderboard.slice(0, 5).map((entry, index) => (
                            <div
                                key={entry.studentId}
                                className={`mini-item ${entry.studentId === user?._id ? 'current' : ''}`}
                            >
                                <span className="mini-rank">
                                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`}
                                </span>
                                <span className="mini-name">{entry.studentName}</span>
                                <span className="mini-score">{entry.score}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PlayQuiz;
