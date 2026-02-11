import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { quizAPI, aiAPI } from '../../services/api';
import {
    FiPlus,
    FiTrash2,
    FiSave,
    FiUpload,
    FiCpu,
    FiSettings,
    FiHelpCircle,
    FiList,
    FiEdit3,
    FiEdit2,
    FiClock,
    FiType
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import './CreateQuiz.css';

const CreateQuiz = () => {
    const navigate = useNavigate();
    const { quizId } = useParams();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [editingIndex, setEditingIndex] = useState(-1);
    const [tempQuestion, setTempQuestion] = useState(null);

    const [quizData, setQuizData] = useState({
        title: '',
        description: '',
        mode: 'mcq',
        settings: {
            quizTimer: 0,
            questionTimer: 30,
            shuffleQuestions: true,
            shuffleOptions: true,
            showInstantFeedback: true,
            showCorrectAnswer: true,
            allowTabSwitch: false,
            maxTabSwitches: 0,
            difficultyLevel: 'medium',
            passingScore: 40,
            showLeaderboard: true
        }
    });

    const [questions, setQuestions] = useState([]);
    const [currentQuestion, setCurrentQuestion] = useState({
        text: '',
        type: 'mcq',
        options: ['', '', '', ''],
        correctAnswer: '',
        points: 10,
        timeLimit: 30,
        difficulty: 'medium',
        explanation: ''
    });

    // AI Generation - empty string means Manual entry mode
    const [aiSource, setAiSource] = useState('');
    const [aiText, setAiText] = useState('');
    const [aiFiles, setAiFiles] = useState([]);
    const [aiSettings, setAiSettings] = useState({
        count: 10,
        difficulty: 'medium',
        type: 'mcq'
    });

    useEffect(() => {
        if (quizId) {
            fetchQuizData();
        }
    }, [quizId]);

    const fetchQuizData = async () => {
        try {
            setLoading(true);
            const response = await quizAPI.getById(quizId);
            const quiz = response.data.data.quiz;

            setQuizData({
                title: quiz.title,
                description: quiz.description || '',
                mode: quiz.mode || 'mcq',
                settings: {
                    quizTimer: quiz.settings?.quizTimer || 0,
                    questionTimer: quiz.settings?.questionTimer || 30,
                    shuffleQuestions: quiz.settings?.shuffleQuestions ?? true,
                    shuffleOptions: quiz.settings?.shuffleOptions ?? true,
                    showInstantFeedback: quiz.settings?.showInstantFeedback ?? true,
                    showCorrectAnswer: quiz.settings?.showCorrectAnswer ?? true,
                    allowTabSwitch: quiz.settings?.allowTabSwitch ?? false,
                    maxTabSwitches: quiz.settings?.maxTabSwitches || 0,
                    difficultyLevel: quiz.settings?.difficultyLevel || 'medium',
                    passingScore: quiz.settings?.passingScore || 40,
                    showLeaderboard: quiz.settings?.showLeaderboard ?? true
                }
            });
            setQuestions(quiz.questions || []);
        } catch (error) {
            console.error('Fetch error:', error);
            toast.error('Failed to load quiz details');
            navigate('/dashboard');
        } finally {
            setLoading(false);
        }
    };

    const handleQuizDataChange = (field, value) => {
        if (field.includes('.')) {
            const [parent, child] = field.split('.');
            setQuizData({
                ...quizData,
                [parent]: { ...quizData[parent], [child]: value }
            });
        } else {
            setQuizData({ ...quizData, [field]: value });
        }
    };

    const handleQuestionChange = (field, value) => {
        setCurrentQuestion({ ...currentQuestion, [field]: value });
    };

    const handleOptionChange = (index, value) => {
        const newOptions = [...currentQuestion.options];
        newOptions[index] = value;
        setCurrentQuestion({ ...currentQuestion, options: newOptions });
    };

    const startEditing = (index) => {
        setEditingIndex(index);
        setTempQuestion({ ...questions[index] });
    };

    const cancelEditing = () => {
        setEditingIndex(-1);
        setTempQuestion(null);
    };

    const saveEditing = () => {
        if (!tempQuestion.text.trim()) {
            toast.error('Question text cannot be empty');
            return;
        }

        const updatedQuestions = [...questions];
        updatedQuestions[editingIndex] = tempQuestion;
        setQuestions(updatedQuestions);
        setEditingIndex(-1);
        setTempQuestion(null);
        toast.success('Question updated');
    };

    const handleTempChange = (field, value) => {
        setTempQuestion(prev => ({ ...prev, [field]: value }));
    };

    const handleTempOptionChange = (index, value) => {
        const newOptions = [...tempQuestion.options];
        newOptions[index] = value;
        setTempQuestion(prev => ({ ...prev, options: newOptions }));
    };

    const addQuestion = () => {
        if (!currentQuestion.text.trim()) {
            toast.error('Please enter question text');
            return;
        }
        if (currentQuestion.type === 'mcq' && currentQuestion.options.filter(o => o.trim()).length < 2) {
            toast.error('Please add at least 2 options');
            return;
        }
        if (!currentQuestion.correctAnswer.trim()) {
            toast.error('Please set the correct answer');
            return;
        }

        setQuestions([...questions, { ...currentQuestion, _id: Date.now().toString() }]);
        setCurrentQuestion({
            text: '',
            type: quizData.mode !== 'mixed' ? quizData.mode : 'mcq',
            options: ['', '', '', ''],
            correctAnswer: '',
            points: 10,
            timeLimit: 30,
            difficulty: quizData.settings.difficultyLevel,
            explanation: ''
        });
        toast.success('Question added');
    };

    const removeQuestion = (index) => {
        setQuestions(questions.filter((_, i) => i !== index));
        toast.success('Question removed');
    };

    const generateWithAI = async () => {
        if (aiSource === 'text') {
            if (!aiText.trim() || aiText.length < 50) {
                toast.error('Please enter at least 50 characters of content');
                return;
            }
        } else if (aiSource === 'file') {
            if (aiFiles.length === 0) {
                toast.error('Please select at least one file');
                return;
            }
        }

        setAiLoading(true);
        try {
            let response;

            if (aiSource === 'text') {
                response = await aiAPI.generateFromText({
                    text: aiText,
                    ...aiSettings
                });
            } else {
                const formData = new FormData();
                aiFiles.forEach(file => {
                    formData.append('files', file);
                });
                formData.append('count', aiSettings.count);
                formData.append('difficulty', aiSettings.difficulty);
                formData.append('type', aiSettings.type);

                response = await aiAPI.generateFromFile(formData);
            }

            const generatedQuestions = response.data.data.questions;
            setQuestions([...questions, ...generatedQuestions.map((q, i) => ({
                ...q,
                _id: `ai-${Date.now()}-${i}`,
                options: q.options || [] // Ensure options is at least an empty array
            }))]);
            toast.success(`${generatedQuestions.length} questions generated!`);
        } catch (error) {
            console.error('AI generation error:', error);
            toast.error(error.response?.data?.message || 'Failed to generate questions');
        } finally {
            setAiLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (!quizData.title.trim()) {
            toast.error('Please enter a quiz title');
            setStep(1);
            return;
        }
        if (questions.length === 0) {
            toast.error('Please add at least one question');
            setStep(2);
            return;
        }

        setLoading(true);
        try {
            const payload = {
                ...quizData,
                questions: questions.map(({ _id, ...q }) => q)
            };

            if (quizId) {
                await quizAPI.update(quizId, payload);
                toast.success('Quiz updated successfully!');
                navigate('/dashboard');
            } else {
                const response = await quizAPI.create(payload);
                toast.success('Quiz created successfully!');
                navigate(`/quiz/${response.data.data.quiz._id}/host`);
            }
        } catch (error) {
            console.error('Submit error:', error);
            toast.error(error.response?.data?.message || 'Failed to save quiz');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="create-quiz-page">
            <div className="page-header">
                <h1>{quizId ? 'Edit Quiz' : 'Create New Quiz'}</h1>
                <p>{quizId ? 'Update your quiz details and questions' : 'Set up your quiz in a few easy steps'}</p>
            </div>

            <div className="stepper">
                <div className={`step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
                    <span className="step-number">1</span>
                    <span className="step-label">Basic Info</span>
                </div>
                <div className="step-line"></div>
                <div className={`step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
                    <span className="step-number">2</span>
                    <span className="step-label">Questions</span>
                </div>
                <div className="step-line"></div>
                <div className={`step ${step >= 3 ? 'active' : ''}`}>
                    <span className="step-number">3</span>
                    <span className="step-label">Settings</span>
                </div>
            </div>

            {/* Step 1: Basic Info */}
            {step === 1 && (
                <div className="step-content animate-slideUp">
                    <div className="form-card">
                        <h2><FiEdit3 /> Quiz Details</h2>

                        <div className="form-group">
                            <label className="form-label">Quiz Title *</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="e.g., Chapter 5: Photosynthesis Quiz"
                                value={quizData.title}
                                onChange={(e) => handleQuizDataChange('title', e.target.value)}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Description</label>
                            <textarea
                                className="form-textarea"
                                placeholder="Brief description of the quiz..."
                                value={quizData.description}
                                onChange={(e) => handleQuizDataChange('description', e.target.value)}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Quiz Mode</label>
                            <div className="mode-selector">
                                {[
                                    { value: 'mcq', icon: <FiList />, label: 'Multiple Choice' },
                                    { value: 'fill-blank', icon: <FiType />, label: 'Fill in Blanks' },
                                    { value: 'qa', icon: <FiHelpCircle />, label: 'Q & A' },
                                    { value: 'mixed', icon: <FiSettings />, label: 'Mixed Mode' }
                                ].map((mode) => (
                                    <button
                                        key={mode.value}
                                        type="button"
                                        className={`mode-btn ${quizData.mode === mode.value ? 'active' : ''}`}
                                        onClick={() => handleQuizDataChange('mode', mode.value)}
                                    >
                                        {mode.icon}
                                        <span>{mode.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Difficulty Level</label>
                            <div className="difficulty-selector">
                                {['easy', 'medium', 'hard', 'advanced'].map((level) => (
                                    <button
                                        key={level}
                                        type="button"
                                        className={`difficulty-btn ${level} ${quizData.settings.difficultyLevel === level ? 'active' : ''}`}
                                        onClick={() => handleQuizDataChange('settings.difficultyLevel', level)}
                                    >
                                        {level.charAt(0).toUpperCase() + level.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="step-actions">
                            <button
                                className="btn btn-primary btn-lg"
                                onClick={() => setStep(2)}
                                disabled={!quizData.title.trim()}
                            >
                                Continue to Questions
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Step 2: Questions */}
            {step === 2 && (
                <div className="step-content animate-slideUp">
                    <div className="questions-layout">
                        <div className="question-form-section">
                            <div className="form-card">
                                <div className="card-tabs">
                                    <button
                                        className={`tab ${aiSource === '' ? 'active' : ''}`}
                                        onClick={() => setAiSource('')}
                                    >
                                        <FiPlus /> Manual
                                    </button>
                                    <button
                                        className={`tab ${aiSource === 'text' ? 'active' : ''}`}
                                        onClick={() => setAiSource('text')}
                                    >
                                        <FiCpu /> AI from Text
                                    </button>
                                    <button
                                        className={`tab ${aiSource === 'file' ? 'active' : ''}`}
                                        onClick={() => setAiSource('file')}
                                    >
                                        <FiUpload /> AI from File
                                    </button>
                                </div>

                                {aiSource === '' && (
                                    <div className="manual-form">
                                        <div className="form-group">
                                            <label className="form-label">Question Type</label>
                                            <select
                                                className="form-select"
                                                value={currentQuestion.type}
                                                onChange={(e) => handleQuestionChange('type', e.target.value)}
                                            >
                                                <option value="mcq">Multiple Choice</option>
                                                <option value="fill-blank">Fill in the Blank</option>
                                                <option value="qa">Question & Answer</option>
                                            </select>
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label">Question Text *</label>
                                            <textarea
                                                className="form-textarea"
                                                placeholder="Enter your question..."
                                                value={currentQuestion.text}
                                                onChange={(e) => handleQuestionChange('text', e.target.value)}
                                            />
                                        </div>

                                        {currentQuestion.type === 'mcq' && (
                                            <div className="form-group">
                                                <label className="form-label">Options</label>
                                                <div className="options-list">
                                                    {currentQuestion.options.map((option, index) => (
                                                        <div key={index} className="option-input">
                                                            <span className="option-label">{String.fromCharCode(65 + index)}</span>
                                                            <input
                                                                type="text"
                                                                className="form-input"
                                                                placeholder={`Option ${index + 1}`}
                                                                value={option}
                                                                onChange={(e) => handleOptionChange(index, e.target.value)}
                                                            />
                                                            <button
                                                                type="button"
                                                                className={`correct-btn ${currentQuestion.correctAnswer === option && option ? 'active' : ''}`}
                                                                onClick={() => handleQuestionChange('correctAnswer', option)}
                                                                disabled={!option}
                                                            >
                                                                ✓
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {currentQuestion.type !== 'mcq' && (
                                            <div className="form-group">
                                                <label className="form-label">Correct Answer *</label>
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    placeholder="Enter the correct answer"
                                                    value={currentQuestion.correctAnswer}
                                                    onChange={(e) => handleQuestionChange('correctAnswer', e.target.value)}
                                                />
                                                <small className="form-hint">For multiple acceptable answers, use | separator</small>
                                            </div>
                                        )}

                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="form-label">Points</label>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    min="1"
                                                    max="100"
                                                    value={currentQuestion.points}
                                                    onChange={(e) => handleQuestionChange('points', parseInt(e.target.value))}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Time Limit (sec)</label>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    min="5"
                                                    max="300"
                                                    value={currentQuestion.timeLimit}
                                                    onChange={(e) => handleQuestionChange('timeLimit', parseInt(e.target.value))}
                                                />
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label">Explanation (optional)</label>
                                            <textarea
                                                className="form-textarea small"
                                                placeholder="Explain the correct answer..."
                                                value={currentQuestion.explanation}
                                                onChange={(e) => handleQuestionChange('explanation', e.target.value)}
                                            />
                                        </div>

                                        <button
                                            className="btn btn-primary w-full"
                                            onClick={addQuestion}
                                        >
                                            <FiPlus /> Add Question
                                        </button>
                                    </div>
                                )}

                                {aiSource === 'text' && (
                                    <div className="ai-form">
                                        <div className="form-group">
                                            <label className="form-label">Paste Your Content</label>
                                            <textarea
                                                className="form-textarea large"
                                                placeholder="Paste lecture notes, textbook content, or any educational material here..."
                                                value={aiText}
                                                onChange={(e) => setAiText(e.target.value)}
                                            />
                                        </div>

                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="form-label">Questions</label>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    min="1"
                                                    max="50"
                                                    value={aiSettings.count}
                                                    onChange={(e) => setAiSettings({ ...aiSettings, count: parseInt(e.target.value) })}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Difficulty</label>
                                                <select
                                                    className="form-select"
                                                    value={aiSettings.difficulty}
                                                    onChange={(e) => setAiSettings({ ...aiSettings, difficulty: e.target.value })}
                                                >
                                                    <option value="easy">Easy</option>
                                                    <option value="medium">Medium</option>
                                                    <option value="hard">Hard</option>
                                                    <option value="advanced">Advanced</option>
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Type</label>
                                                <select
                                                    className="form-select"
                                                    value={aiSettings.type}
                                                    onChange={(e) => setAiSettings({ ...aiSettings, type: e.target.value })}
                                                >
                                                    <option value="mcq">MCQ</option>
                                                    <option value="fill-blank">Fill-blank</option>
                                                    <option value="qa">Q&A</option>
                                                </select>
                                            </div>
                                        </div>

                                        <button
                                            className="btn btn-primary w-full"
                                            onClick={generateWithAI}
                                            disabled={aiLoading}
                                        >
                                            {aiLoading ? (
                                                <><span className="spinner spinner-sm"></span> Generating...</>
                                            ) : (
                                                <><FiCpu /> Generate Questions</>
                                            )}
                                        </button>
                                    </div>
                                )}

                                {aiSource === 'file' && (
                                    <div className="ai-form">
                                        <div className="file-upload-area">
                                            <input
                                                type="file"
                                                id="file-upload"
                                                multiple
                                                accept=".pdf,.xlsx,.xls,.csv,.txt,.mp3,.wav,.mp4,.webm"
                                                onChange={(e) => setAiFiles(Array.from(e.target.files))}
                                            />
                                            <label htmlFor="file-upload" className="file-upload-label">
                                                <FiUpload className="upload-icon" />
                                                <span>{aiFiles.length > 0 ? `${aiFiles.length} files selected` : 'Click to select files'}</span>
                                                <small>PDF, Excel, Audio, Video, or Text</small>
                                            </label>
                                        </div>

                                        {aiFiles.length > 0 && (
                                            <div style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                {aiFiles.map(f => f.name).join(', ')}
                                            </div>
                                        )}

                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="form-label">Questions</label>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    min="1"
                                                    max="50"
                                                    value={aiSettings.count}
                                                    onChange={(e) => setAiSettings({ ...aiSettings, count: parseInt(e.target.value) })}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Difficulty</label>
                                                <select
                                                    className="form-select"
                                                    value={aiSettings.difficulty}
                                                    onChange={(e) => setAiSettings({ ...aiSettings, difficulty: e.target.value })}
                                                >
                                                    <option value="easy">Easy</option>
                                                    <option value="medium">Medium</option>
                                                    <option value="hard">Hard</option>
                                                    <option value="advanced">Advanced</option>
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Type</label>
                                                <select
                                                    className="form-select"
                                                    value={aiSettings.type}
                                                    onChange={(e) => setAiSettings({ ...aiSettings, type: e.target.value })}
                                                >
                                                    <option value="mcq">MCQ</option>
                                                    <option value="fill-blank">Fill-blank</option>
                                                    <option value="qa">Q&A</option>
                                                </select>
                                            </div>
                                        </div>

                                        <button
                                            className="btn btn-primary w-full"
                                            onClick={generateWithAI}
                                            disabled={aiLoading || aiFiles.length === 0}
                                        >
                                            {aiLoading ? (
                                                <><span className="spinner spinner-sm"></span> Generating...</>
                                            ) : (
                                                <><FiCpu /> Generate from File</>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="questions-list-section">
                            <div className="form-card">
                                <h2>Questions ({questions.length})</h2>

                                {questions.length === 0 ? (
                                    <div className="empty-questions">
                                        <span className="empty-icon">❓</span>
                                        <p>No questions added yet</p>
                                        <small>Add questions manually or generate with AI</small>
                                    </div>
                                ) : (
                                    <div className="questions-list">
                                        {questions.map((q, index) => (
                                            <div key={q._id || index} className="question-item" style={{ flexDirection: 'column', gap: '10px' }}>
                                                {editingIndex === index ? (
                                                    <div className="edit-question-form" style={{ width: '100%' }}>
                                                        <div className="form-group" style={{ marginBottom: '10px' }}>
                                                            <label style={{ fontSize: '0.85rem', fontWeight: '600' }}>Question Text</label>
                                                            <input
                                                                type="text"
                                                                className="form-input"
                                                                value={tempQuestion.text}
                                                                onChange={(e) => handleTempChange('text', e.target.value)}
                                                                style={{ padding: '8px', fontSize: '0.95rem' }}
                                                            />
                                                        </div>

                                                        {tempQuestion.type === 'mcq' && (
                                                            <div className="edit-options-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                                                                {tempQuestion.options.map((opt, i) => (
                                                                    <div key={i} className="edit-option" style={{ display: 'flex', gap: '5px' }}>
                                                                        <input
                                                                            type="text"
                                                                            className="form-input"
                                                                            value={opt}
                                                                            onChange={(e) => handleTempOptionChange(i, e.target.value)}
                                                                            placeholder={`Option ${i + 1}`}
                                                                            style={{ padding: '6px', fontSize: '0.9rem' }}
                                                                        />
                                                                        <button
                                                                            className={`btn-icon ${tempQuestion.correctAnswer === opt ? 'text-success' : 'text-muted'}`}
                                                                            onClick={() => handleTempChange('correctAnswer', opt)}
                                                                            title="Mark as correct"
                                                                        >
                                                                            ✓
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        <div className="edit-meta-row" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                <span style={{ fontSize: '0.8rem' }}>Time (s):</span>
                                                                <input
                                                                    type="number"
                                                                    className="form-input"
                                                                    style={{ width: '60px', padding: '4px' }}
                                                                    value={tempQuestion.timeLimit}
                                                                    onChange={(e) => handleTempChange('timeLimit', parseInt(e.target.value))}
                                                                />
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                <span style={{ fontSize: '0.8rem' }}>Points:</span>
                                                                <input
                                                                    type="number"
                                                                    className="form-input"
                                                                    style={{ width: '60px', padding: '4px' }}
                                                                    value={tempQuestion.points}
                                                                    onChange={(e) => handleTempChange('points', parseInt(e.target.value))}
                                                                />
                                                            </div>
                                                            <div style={{ flex: 1 }}></div>
                                                            <button className="btn btn-sm btn-secondary" onClick={cancelEditing}>Cancel</button>
                                                            <button className="btn btn-sm btn-primary" onClick={saveEditing}>Save</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', gap: '12px', width: '100%', alignItems: 'flex-start' }}>
                                                        <div className="question-number">{index + 1}</div>
                                                        <div className="question-content" style={{ flex: 1 }}>
                                                            <p className="question-text" style={{ fontSize: '1rem', textAlign: 'left', lineHeight: '1.4' }}>{q.text}</p>
                                                            <div className="question-meta" style={{ marginTop: '6px' }}>
                                                                <span className={`badge badge-${q.difficulty === 'easy' ? 'success' : q.difficulty === 'medium' ? 'warning' : 'danger'}`}>
                                                                    {q.difficulty}
                                                                </span>
                                                                <span className="meta-item">{q.type.toUpperCase()}</span>
                                                                <span className="meta-item">{q.points} pts</span>
                                                                <span className="meta-item" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <FiClock size={12} /> {q.timeLimit}s
                                                                </span>
                                                            </div>
                                                            {q.type === 'mcq' && (
                                                                <div className="preview-options" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}>
                                                                    {q.options.map((opt, i) => (
                                                                        <div key={i} style={{
                                                                            fontSize: '0.85rem',
                                                                            padding: '4px 8px',
                                                                            background: q.correctAnswer === opt ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-tertiary)',
                                                                            border: q.correctAnswer === opt ? '1px solid var(--success)' : '1px solid transparent',
                                                                            borderRadius: '4px',
                                                                            color: 'var(--text-secondary)'
                                                                        }}>
                                                                            {String.fromCharCode(65 + i)}. {opt}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="actions" style={{ display: 'flex', gap: '4px' }}>
                                                            <button
                                                                className="btn btn-icon btn-ghost"
                                                                onClick={() => startEditing(index)}
                                                                title="Edit Question"
                                                            >
                                                                <FiEdit2 size={16} />
                                                            </button>
                                                            <button
                                                                className="btn btn-icon btn-ghost"
                                                                onClick={() => removeQuestion(index)}
                                                                title="Delete Question"
                                                                style={{ color: 'var(--danger)' }}
                                                            >
                                                                <FiTrash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="step-actions">
                        <button className="btn btn-secondary" onClick={() => setStep(1)}>
                            Back
                        </button>
                        <button
                            className="btn btn-primary btn-lg"
                            onClick={() => setStep(3)}
                            disabled={questions.length === 0}
                        >
                            Continue to Settings
                        </button>
                    </div>
                </div >
            )}

            {/* Step 3: Settings */}
            {
                step === 3 && (
                    <div className="step-content animate-slideUp">
                        <div className="settings-grid">
                            <div className="form-card">
                                <h2><FiSettings /> Timer Settings</h2>

                                <div className="form-group">
                                    <label className="form-label">Quiz Time Limit (minutes)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        min="0"
                                        max="180"
                                        placeholder="0 = No limit"
                                        value={quizData.settings.quizTimer === 0 ? '' : quizData.settings.quizTimer / 60}
                                        onChange={(e) => handleQuizDataChange('settings.quizTimer', e.target.value === '' ? 0 : parseInt(e.target.value) * 60)}
                                    />
                                    <small className="form-hint">Set to 0 for no overall time limit</small>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Default Question Timer (seconds)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        min="5"
                                        max="300"
                                        value={quizData.settings.questionTimer}
                                        onChange={(e) => handleQuizDataChange('settings.questionTimer', e.target.value === '' ? 30 : parseInt(e.target.value))}
                                    />
                                </div>
                            </div>

                            <div className="form-card">
                                <h2><FiHelpCircle /> Quiz Behavior</h2>

                                <div className="toggle-group">
                                    <label className="toggle-label">
                                        <span>Shuffle Questions</span>
                                        <input
                                            type="checkbox"
                                            checked={quizData.settings.shuffleQuestions}
                                            onChange={(e) => handleQuizDataChange('settings.shuffleQuestions', e.target.checked)}
                                        />
                                        <span className="toggle-switch"></span>
                                    </label>
                                </div>

                                <div className="toggle-group">
                                    <label className="toggle-label">
                                        <span>Shuffle Options (MCQ)</span>
                                        <input
                                            type="checkbox"
                                            checked={quizData.settings.shuffleOptions}
                                            onChange={(e) => handleQuizDataChange('settings.shuffleOptions', e.target.checked)}
                                        />
                                        <span className="toggle-switch"></span>
                                    </label>
                                </div>

                                <div className="toggle-group">
                                    <label className="toggle-label">
                                        <span>Show Instant Feedback</span>
                                        <input
                                            type="checkbox"
                                            checked={quizData.settings.showInstantFeedback}
                                            onChange={(e) => handleQuizDataChange('settings.showInstantFeedback', e.target.checked)}
                                        />
                                        <span className="toggle-switch"></span>
                                    </label>
                                </div>

                                <div className="toggle-group">
                                    <label className="toggle-label">
                                        <span>Show Live Leaderboard</span>
                                        <input
                                            type="checkbox"
                                            checked={quizData.settings.showLeaderboard}
                                            onChange={(e) => handleQuizDataChange('settings.showLeaderboard', e.target.checked)}
                                        />
                                        <span className="toggle-switch"></span>
                                    </label>
                                </div>
                            </div>

                            <div className="form-card">
                                <h2>🔒 Security</h2>

                                <div className="toggle-group">
                                    <label className="toggle-label">
                                        <span>Allow Tab Switching</span>
                                        <input
                                            type="checkbox"
                                            checked={quizData.settings.allowTabSwitch}
                                            onChange={(e) => handleQuizDataChange('settings.allowTabSwitch', e.target.checked)}
                                        />
                                        <span className="toggle-switch"></span>
                                    </label>
                                </div>

                                {quizData.settings.allowTabSwitch && (
                                    <div className="form-group">
                                        <label className="form-label">Max Tab Switches (0 = unlimited)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            min="0"
                                            max="10"
                                            value={quizData.settings.maxTabSwitches}
                                            onChange={(e) => handleQuizDataChange('settings.maxTabSwitches', e.target.value === '' ? 0 : parseInt(e.target.value))}
                                        />
                                    </div>
                                )}

                                <div className="form-group">
                                    <label className="form-label">Passing Score (%)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        min="0"
                                        max="100"
                                        value={quizData.settings.passingScore}
                                        onChange={(e) => handleQuizDataChange('settings.passingScore', e.target.value === '' ? 0 : parseInt(e.target.value))}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="step-actions">
                            <button className="btn btn-secondary" onClick={() => setStep(2)}>
                                Back
                            </button>
                            <button
                                className="btn btn-primary btn-lg"
                                onClick={handleSubmit}
                                disabled={loading}
                            >
                                {loading ? (
                                    <><span className="spinner spinner-sm"></span> Creating...</>
                                ) : (
                                    <><FiSave /> Create Quiz</>
                                )}
                            </button>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default CreateQuiz;
