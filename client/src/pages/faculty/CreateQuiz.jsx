import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { quizAPI, aiAPI, userAPI } from '../../services/api';
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
    FiType,
    FiUsers,
    FiLock,
    FiCheck,
    FiSearch,
    FiFilter
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
        subject: '',
        description: '',
        mode: 'mcq',
        settings: {
            quizTimer: 600, // Default 10 mins
            shuffleQuestions: true,
            shuffleOptions: true,
            showInstantFeedback: true,
            showCorrectAnswer: true,
            allowTabSwitch: false,
            maxTabSwitches: 0,
            difficultyLevel: 'medium',
            passingScore: 40,
            showLeaderboard: true
        },
        accessControl: {
            isPublic: true,
            allowedBranches: [] // [{ name: 'CSE', sections: ['A', 'B'] }]
        },
        scheduledAt: null
    });

    const [questions, setQuestions] = useState([]);
    const [currentQuestion, setCurrentQuestion] = useState({
        text: '',
        type: 'mcq',
        options: ['', '', '', ''],
        correctAnswer: '',
        points: 10,
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

    const [availableStudents, setAvailableStudents] = useState([]);
    const [fetchingStudents, setFetchingStudents] = useState(false);
    const [studentSearch, setStudentSearch] = useState('');
    const [studentSectionFilter, setStudentSectionFilter] = useState('all');

    // Fetch students whenever branches/sections change (regardless of mode)
    useEffect(() => {
        const fetchStudents = async () => {
            const access = quizData.accessControl;
            if (!access.isPublic && access.allowedBranches.length > 0) {
                setFetchingStudents(true);
                try {
                    const res = await userAPI.searchStudents(access.allowedBranches);
                    setAvailableStudents(res.data.data || []);
                } catch (error) {
                    console.error('Fetch students error:', error);
                } finally {
                    setFetchingStudents(false);
                }
            } else {
                setAvailableStudents([]);
            }
        };

        const timer = setTimeout(fetchStudents, 500);
        return () => clearTimeout(timer);
    }, [quizData.accessControl.isPublic, quizData.accessControl.allowedBranches]);

    // Filtered students based on search and section filter
    const filteredStudents = useMemo(() => {
        let students = availableStudents;
        if (studentSectionFilter !== 'all') {
            students = students.filter(s => s.section === studentSectionFilter);
        }
        if (studentSearch.trim()) {
            const q = studentSearch.toLowerCase().trim();
            students = students.filter(s =>
                (s.name && s.name.toLowerCase().includes(q)) ||
                (s.rollNumber && s.rollNumber.toLowerCase().includes(q)) ||
                (s.email && s.email.toLowerCase().includes(q))
            );
        }
        return students;
    }, [availableStudents, studentSearch, studentSectionFilter]);

    // Get unique sections from available students for the filter dropdown
    const availableSections = useMemo(() => {
        const sections = new Set();
        availableStudents.forEach(s => {
            if (s.section) sections.add(s.section);
        });
        return Array.from(sections).sort();
    }, [availableStudents]);

    // Student selection handlers
    const handleStudentToggle = (studentId) => {
        const current = quizData.accessControl.allowedStudents || [];
        const exists = current.includes(studentId);
        const updated = exists
            ? current.filter(id => id !== studentId)
            : [...current, studentId];
        handleAccessControlChange('allowedStudents', updated);
    };

    const handleSelectAllStudents = () => {
        const allIds = filteredStudents.map(s => s._id);
        const current = quizData.accessControl.allowedStudents || [];
        const allSelected = allIds.every(id => current.includes(id));
        if (allSelected) {
            // Deselect filtered students, keep others
            const updated = current.filter(id => !allIds.includes(id));
            handleAccessControlChange('allowedStudents', updated);
        } else {
            // Select ALL filtered students, union with existing
            const merged = [...new Set([...current, ...allIds])];
            handleAccessControlChange('allowedStudents', merged);
        }
    };

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
                subject: quiz.subject || '',
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
                },
                accessControl: quiz.accessControl || {
                    isPublic: true,
                    allowedBranches: []
                },
                scheduledAt: quiz.scheduledAt || null
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

    // Access Control Handlers
    const handleAccessControlChange = (field, value) => {
        setQuizData(prev => ({
            ...prev,
            accessControl: {
                ...prev.accessControl,
                [field]: value
            }
        }));
    };

    const handleBranchToggle = (branchName) => {
        const currentBranches = quizData.accessControl.allowedBranches || [];
        const exists = currentBranches.find(b => b.name === branchName);

        let newBranches;
        if (exists) {
            // Remove branch
            newBranches = currentBranches.filter(b => b.name !== branchName);
        } else {
            // Add branch with default empty sections
            newBranches = [...currentBranches, { name: branchName, sections: [] }];
        }

        handleAccessControlChange('allowedBranches', newBranches);
    };

    const handleSectionToggle = (branchName, section) => {
        const currentBranches = quizData.accessControl.allowedBranches || [];
        const branchIndex = currentBranches.findIndex(b => b.name === branchName);

        if (branchIndex === -1) return; // Should not happen

        const branch = currentBranches[branchIndex];
        const sectionExists = branch.sections.includes(section);

        let newSections;
        if (sectionExists) {
            newSections = branch.sections.filter(s => s !== section);
        } else {
            newSections = [...branch.sections, section].sort();
        }

        const newBranches = [...currentBranches];
        newBranches[branchIndex] = { ...branch, sections: newSections };

        handleAccessControlChange('allowedBranches', newBranches);
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
        if ((currentQuestion.type === 'mcq' || currentQuestion.type === 'msq') && currentQuestion.options.filter(o => o.trim()).length < 2) {
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

        // Access Control Validation
        if (!quizData.accessControl.isPublic) {
            if (quizData.accessControl.allowedBranches.length === 0) {
                toast.error('Please select at least one branch for restricted quiz');
                setStep(1);
                return;
            }
            if (quizData.accessControl.mode === 'SPECIFIC' &&
                (!quizData.accessControl.allowedStudents || quizData.accessControl.allowedStudents.length === 0)) {
                toast.error('Please select at least one student for Specific mode');
                setStep(1);
                return;
            }
        }

        setLoading(true);
        try {
            const payload = {
                ...quizData,
                settings: {
                    ...quizData.settings,
                    autoStart: Boolean(quizData.scheduledAt)
                },
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
                            <label className="form-label">Subject *</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="e.g., Biology"
                                value={quizData.subject}
                                onChange={(e) => handleQuizDataChange('subject', e.target.value)}
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

                        <div className="form-section-divider"></div>

                        <div className="form-group">
                            <label className="form-label">🔒 Quiz Audience</label>
                            <div className="audience-selector">
                                <button
                                    type="button"
                                    className={`audience-btn ${quizData.accessControl.isPublic ? 'active' : ''}`}
                                    onClick={() => handleAccessControlChange('isPublic', true)}
                                >
                                    <FiUsers />
                                    <div className="btn-content">
                                        <span className="btn-title">Public</span>
                                        <span className="btn-desc">Anyone with the code can join</span>
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    className={`audience-btn ${!quizData.accessControl.isPublic ? 'active' : ''}`}
                                    onClick={() => handleAccessControlChange('isPublic', false)}
                                >
                                    <FiLock />
                                    <div className="btn-content">
                                        <span className="btn-title">Restricted</span>
                                        <span className="btn-desc">Only selected branches/sections</span>
                                    </div>
                                </button>
                            </div>
                        </div>

                        {!quizData.accessControl.isPublic && (
                            <div className="access-control-panel animate-fadeIn">
                                {/* Step 1: Select Branch */}
                                <p className="section-subtitle">📌 Step 1: Select Branch</p>

                                {/* CSE Branch */}
                                <div className="branch-group">
                                    <div className="branch-header">
                                        <input
                                            type="checkbox"
                                            id="branch-cse"
                                            checked={quizData.accessControl.allowedBranches.some(b => b.name === 'CSE')}
                                            onChange={() => handleBranchToggle('CSE')}
                                        />
                                        <label htmlFor="branch-cse">CSE (Computer Science & Engineering)</label>
                                    </div>

                                    {quizData.accessControl.allowedBranches.some(b => b.name === 'CSE') && (
                                        <div className="section-grid">
                                            {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map(section => (
                                                <label key={`cse-${section}`} className="section-checkbox">
                                                    <input
                                                        type="checkbox"
                                                        checked={quizData.accessControl.allowedBranches.find(b => b.name === 'CSE')?.sections.includes(section) || false}
                                                        onChange={() => handleSectionToggle('CSE', section)}
                                                    />
                                                    <span>Sec {section}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* CSM Branch */}
                                <div className="branch-group" style={{ marginTop: '15px' }}>
                                    <div className="branch-header">
                                        <input
                                            type="checkbox"
                                            id="branch-csm"
                                            checked={quizData.accessControl.allowedBranches.some(b => b.name === 'CSM')}
                                            onChange={() => handleBranchToggle('CSM')}
                                        />
                                        <label htmlFor="branch-csm">CSM (CSE - AI & ML)</label>
                                    </div>

                                    {quizData.accessControl.allowedBranches.some(b => b.name === 'CSM') && (
                                        <div className="section-grid">
                                            {['A', 'B', 'C', 'D', 'E'].map(section => (
                                                <label key={`csm-${section}`} className="section-checkbox">
                                                    <input
                                                        type="checkbox"
                                                        checked={quizData.accessControl.allowedBranches.find(b => b.name === 'CSM')?.sections.includes(section) || false}
                                                        onChange={() => handleSectionToggle('CSM', section)}
                                                    />
                                                    <span>Sec {section}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Step 2: Select Section (All or Specific) - shown hint */}
                                {quizData.accessControl.allowedBranches.length > 0 && (
                                    <div className="section-hint-msg">
                                        <FiCheck size={14} />
                                        <span>
                                            {quizData.accessControl.allowedBranches.some(b => b.sections && b.sections.length > 0)
                                                ? `Selected sections: ${quizData.accessControl.allowedBranches.map(b => `${b.name} (${b.sections.length > 0 ? b.sections.join(', ') : 'All'})`).join(' | ')}`
                                                : 'All sections selected (no specific sections chosen)'
                                            }
                                        </span>
                                    </div>
                                )}

                                {/* Step 3: Select Students */}
                                {quizData.accessControl.allowedBranches.length > 0 && (
                                    <div className="student-selection-section animate-fadeIn">
                                        <p className="section-subtitle">📌 Step 2: Select Students</p>

                                        {/* Student Mode Toggle: ALL or SPECIFIC */}
                                        <div className="student-mode-selector">
                                            <button
                                                type="button"
                                                className={`student-mode-btn ${(quizData.accessControl.mode || 'ALL') === 'ALL' ? 'active' : ''}`}
                                                onClick={() => {
                                                    handleAccessControlChange('mode', 'ALL');
                                                    handleAccessControlChange('allowedStudents', []);
                                                }}
                                            >
                                                <FiUsers size={18} />
                                                <div>
                                                    <span className="mode-label">All Students</span>
                                                    <span className="mode-desc">Everyone in selected branches/sections</span>
                                                </div>
                                            </button>
                                            <button
                                                type="button"
                                                className={`student-mode-btn ${quizData.accessControl.mode === 'SPECIFIC' ? 'active' : ''}`}
                                                onClick={() => handleAccessControlChange('mode', 'SPECIFIC')}
                                            >
                                                <FiFilter size={18} />
                                                <div>
                                                    <span className="mode-label">Specific Students</span>
                                                    <span className="mode-desc">Hand-pick individual students</span>
                                                </div>
                                            </button>
                                        </div>

                                        {/* Student count info */}
                                        {fetchingStudents && (
                                            <div className="student-loading">
                                                <span className="spinner spinner-sm"></span>
                                                <span>Loading students...</span>
                                            </div>
                                        )}

                                        {!fetchingStudents && availableStudents.length > 0 && (
                                            <div className="student-count-badge">
                                                <FiUsers size={14} />
                                                <span>
                                                    {quizData.accessControl.mode === 'SPECIFIC'
                                                        ? `${(quizData.accessControl.allowedStudents || []).length} of ${availableStudents.length} students selected`
                                                        : `${availableStudents.length} students will have access`
                                                    }
                                                </span>
                                            </div>
                                        )}

                                        {/* SPECIFIC mode: show student list with checkboxes */}
                                        {quizData.accessControl.mode === 'SPECIFIC' && !fetchingStudents && (
                                            <div className="student-picker-panel animate-fadeIn">
                                                {/* Search & Filters */}
                                                <div className="student-picker-toolbar">
                                                    <div className="student-search-box">
                                                        <FiSearch size={16} />
                                                        <input
                                                            type="text"
                                                            placeholder="Search by name, roll number, or email..."
                                                            value={studentSearch}
                                                            onChange={(e) => setStudentSearch(e.target.value)}
                                                        />
                                                    </div>
                                                    {availableSections.length > 1 && (
                                                        <select
                                                            className="student-section-filter"
                                                            value={studentSectionFilter}
                                                            onChange={(e) => setStudentSectionFilter(e.target.value)}
                                                        >
                                                            <option value="all">All Sections</option>
                                                            {availableSections.map(sec => (
                                                                <option key={sec} value={sec}>Section {sec}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>

                                                {/* Select All toggle */}
                                                {filteredStudents.length > 0 && (
                                                    <div className="student-select-all">
                                                        <label className="student-select-all-label">
                                                            <input
                                                                type="checkbox"
                                                                checked={filteredStudents.length > 0 && filteredStudents.every(s => (quizData.accessControl.allowedStudents || []).includes(s._id))}
                                                                onChange={handleSelectAllStudents}
                                                            />
                                                            <span>
                                                                Select All ({filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''})
                                                            </span>
                                                        </label>
                                                    </div>
                                                )}

                                                {/* Student list */}
                                                <div className="student-list">
                                                    {filteredStudents.length === 0 ? (
                                                        <div className="student-empty">
                                                            <span>😕</span>
                                                            <p>{studentSearch ? 'No students match your search' : 'No students found in selected branches/sections'}</p>
                                                        </div>
                                                    ) : (
                                                        filteredStudents.map(student => {
                                                            const isSelected = (quizData.accessControl.allowedStudents || []).includes(student._id);
                                                            return (
                                                                <label
                                                                    key={student._id}
                                                                    className={`student-item ${isSelected ? 'selected' : ''}`}
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isSelected}
                                                                        onChange={() => handleStudentToggle(student._id)}
                                                                    />
                                                                    <div className="student-avatar">
                                                                        {student.name ? student.name.charAt(0).toUpperCase() : '?'}
                                                                    </div>
                                                                    <div className="student-info">
                                                                        <span className="student-name">{student.name || 'Unknown'}</span>
                                                                        <span className="student-detail">
                                                                            {student.rollNumber || student.email} {student.department && student.section ? `• ${student.department}-${student.section}` : ''}
                                                                        </span>
                                                                    </div>
                                                                    {isSelected && (
                                                                        <div className="student-check-icon">
                                                                            <FiCheck size={16} />
                                                                        </div>
                                                                    )}
                                                                </label>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="form-section-divider"></div>

                        <div className="form-group">
                            <label className="form-label"><FiClock /> Scheduling</label>
                            <label className="toggle-label" style={{ marginBottom: '10px' }}>
                                <span>Schedule for later</span>
                                <input
                                    type="checkbox"
                                    checked={!!quizData.scheduledAt}
                                    onChange={(e) => handleQuizDataChange('scheduledAt', e.target.checked ? new Date(Date.now() + 3600000).toISOString().slice(0, 16) : null)}
                                />
                                <span className="toggle-switch"></span>
                            </label>

                            {quizData.scheduledAt && (
                                <div className="schedule-picker animate-fadeIn">
                                    <input
                                        type="datetime-local"
                                        className="form-input"
                                        value={typeof quizData.scheduledAt === 'string' ? quizData.scheduledAt.slice(0, 16) : new Date(quizData.scheduledAt).toISOString().slice(0, 16)}
                                        onChange={(e) => handleQuizDataChange('scheduledAt', e.target.value)}
                                        min={new Date().toISOString().slice(0, 16)}
                                    />
                                </div>
                            )}
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
                                                onChange={(e) => {
                                                    const newType = e.target.value;
                                                    // Reset correct answer when switching between single and multiple choice
                                                    setCurrentQuestion({
                                                        ...currentQuestion,
                                                        type: newType,
                                                        correctAnswer: ''
                                                    });
                                                }}
                                            >
                                                <option value="mcq">Multiple Choice (Single Answer)</option>
                                                <option value="msq">Multiple Select (Multiple Answers)</option>
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

                                        {(currentQuestion.type === 'mcq' || currentQuestion.type === 'msq') && (
                                            <div className="form-group">
                                                <label className="form-label">Options (Check the correct answer/s)</label>
                                                <div className="options-selection-area">
                                                    {currentQuestion.options.map((option, index) => {
                                                        const isCorrect = currentQuestion.type === 'mcq'
                                                            ? currentQuestion.correctAnswer === option && option !== ''
                                                            : currentQuestion.correctAnswer.split(',').filter(Boolean).includes(option) && option !== '';

                                                        return (
                                                            <div key={index} className={`option-item-row ${isCorrect ? 'is-correct' : ''}`}>
                                                                <div className="option-control">
                                                                    {currentQuestion.type === 'mcq' ? (
                                                                        <input
                                                                            type="radio"
                                                                            name="correct-opt"
                                                                            checked={isCorrect}
                                                                            onChange={() => handleQuestionChange('correctAnswer', option)}
                                                                            disabled={!option.trim()}
                                                                        />
                                                                    ) : (
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isCorrect}
                                                                            onChange={() => {
                                                                                const current = currentQuestion.correctAnswer.split(',').filter(Boolean);
                                                                                let next;
                                                                                if (current.includes(option)) {
                                                                                    next = current.filter(a => a !== option);
                                                                                } else {
                                                                                    next = [...current, option];
                                                                                }
                                                                                handleQuestionChange('correctAnswer', next.join(','));
                                                                            }}
                                                                            disabled={!option.trim()}
                                                                        />
                                                                    )}
                                                                </div>
                                                                <input
                                                                    type="text"
                                                                    className="form-input"
                                                                    placeholder={`Option ${index + 1}`}
                                                                    value={option}
                                                                    onChange={(e) => {
                                                                        const oldVal = option;
                                                                        const newVal = e.target.value;
                                                                        handleOptionChange(index, newVal);

                                                                        // Update correctAnswer if this option was selected
                                                                        if (currentQuestion.type === 'mcq' && currentQuestion.correctAnswer === oldVal) {
                                                                            handleQuestionChange('correctAnswer', newVal);
                                                                        } else if (currentQuestion.type === 'msq') {
                                                                            const current = currentQuestion.correctAnswer.split(',').filter(Boolean);
                                                                            if (current.includes(oldVal)) {
                                                                                const next = current.map(a => a === oldVal ? newVal : a);
                                                                                handleQuestionChange('correctAnswer', next.join(','));
                                                                            }
                                                                        }
                                                                    }}
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <small className="form-hint">At least 2 options required. Mark the correct answer using radio/box.</small>
                                            </div>
                                        )}

                                        {currentQuestion.type !== 'mcq' && currentQuestion.type !== 'msq' && (
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
                                                    <option value="mcq">MCQ (Single)</option>
                                                    <option value="msq">MSQ (Multi)</option>
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
                                                accept=".pdf,.xlsx,.xls,.csv,.txt,.mp3,.wav,.mp4,.webm,.md,.js,.jsx,.ts,.tsx,.py,.java,.cpp,.c,.cs,.html,.css,.json,.sql,.go,.rb,.php"
                                                onChange={(e) => setAiFiles(Array.from(e.target.files))}
                                            />
                                            <label htmlFor="file-upload" className="file-upload-label">
                                                <FiUpload className="upload-icon" />
                                                <span>{aiFiles.length > 0 ? `${aiFiles.length} files selected` : 'Click to select files'}</span>
                                                <small>PDF, Excel, Audio, Video, Text, or Code</small>
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
                                                    <option value="mcq">MCQ (Single)</option>
                                                    <option value="msq">MSQ (Multi)</option>
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

                                                        {(tempQuestion.type === 'mcq' || tempQuestion.type === 'msq') && (
                                                            <div className="edit-options-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                                                                {tempQuestion.options.map((opt, i) => {
                                                                    const isCorrect = tempQuestion.type === 'mcq'
                                                                        ? tempQuestion.correctAnswer === opt && opt !== ''
                                                                        : tempQuestion.correctAnswer.split(',').filter(Boolean).includes(opt) && opt !== '';

                                                                    return (
                                                                        <div key={i} className={`edit-option ${isCorrect ? 'is-correct-bg' : ''}`} style={{ display: 'flex', gap: '5px', alignItems: 'center', padding: '4px', borderRadius: '4px' }}>
                                                                            {tempQuestion.type === 'mcq' ? (
                                                                                <input
                                                                                    type="radio"
                                                                                    name={`edit-correct-${editingIndex}`}
                                                                                    checked={isCorrect}
                                                                                    onChange={() => handleTempChange('correctAnswer', opt)}
                                                                                    disabled={!opt.trim()}
                                                                                />
                                                                            ) : (
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={isCorrect}
                                                                                    onChange={() => {
                                                                                        const current = tempQuestion.correctAnswer.split(',').filter(Boolean);
                                                                                        let next;
                                                                                        if (current.includes(opt)) {
                                                                                            next = current.filter(a => a !== opt);
                                                                                        } else {
                                                                                            next = [...current, opt];
                                                                                        }
                                                                                        handleTempChange('correctAnswer', next.join(','));
                                                                                    }}
                                                                                    disabled={!opt.trim()}
                                                                                />
                                                                            )}
                                                                            <input
                                                                                type="text"
                                                                                className="form-input"
                                                                                value={opt}
                                                                                onChange={(e) => {
                                                                                    const oldVal = opt;
                                                                                    const newVal = e.target.value;
                                                                                    handleTempOptionChange(i, newVal);

                                                                                    if (tempQuestion.type === 'mcq' && tempQuestion.correctAnswer === oldVal) {
                                                                                        handleTempChange('correctAnswer', newVal);
                                                                                    } else if (tempQuestion.type === 'msq') {
                                                                                        const current = tempQuestion.correctAnswer.split(',').filter(Boolean);
                                                                                        if (current.includes(oldVal)) {
                                                                                            const next = current.map(a => a === oldVal ? newVal : a);
                                                                                            handleTempChange('correctAnswer', next.join(','));
                                                                                        }
                                                                                    }
                                                                                }}
                                                                                placeholder={`Option ${i + 1}`}
                                                                                style={{ padding: '6px', fontSize: '0.9rem', flex: 1 }}
                                                                            />
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}

                                                        <div className="edit-meta-row" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
                                                            </div>
                                                            {(q.type === 'mcq' || q.type === 'msq') && (
                                                                <div className="preview-options" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}>
                                                                    {q.options.map((opt, i) => {
                                                                        let isCorrect = false;
                                                                        if (q.type === 'mcq') {
                                                                            isCorrect = q.correctAnswer === opt || (typeof q.correctAnswer === 'string' && q.correctAnswer.trim() === opt.trim());
                                                                        } else {
                                                                            // For MSQ, correctAnswer is comma-separated string
                                                                            const correctArr = typeof q.correctAnswer === 'string' ? q.correctAnswer.split(',') : [];
                                                                            isCorrect = correctArr.some(c => c.trim() === opt.trim());
                                                                        }

                                                                        return (
                                                                            <div key={i} style={{
                                                                                fontSize: '0.85rem',
                                                                                padding: '6px 12px',
                                                                                background: isCorrect ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-tertiary)',
                                                                                border: isCorrect ? '1px solid var(--success)' : '1px solid transparent',
                                                                                borderRadius: '4px',
                                                                                color: isCorrect ? 'var(--success)' : 'var(--text-secondary)',
                                                                                fontWeight: isCorrect ? '600' : 'normal',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                gap: '8px'
                                                                            }}>
                                                                                <span style={{ opacity: 0.7 }}>{String.fromCharCode(65 + i)}.</span>
                                                                                <span style={{ flex: 1 }}>{opt}</span>
                                                                                {isCorrect && <FiCheck size={16} />}
                                                                            </div>
                                                                        );
                                                                    })}
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
            )
            }

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
                                        <span>Allow Tab Switching (Open Book)</span>
                                        <input
                                            type="checkbox"
                                            checked={quizData.settings.allowTabSwitch}
                                            onChange={(e) => handleQuizDataChange('settings.allowTabSwitch', e.target.checked)}
                                        />
                                        <span className="toggle-switch"></span>
                                    </label>
                                </div>

                                {quizData.settings.allowTabSwitch && (
                                    <div className="form-group animate-slideUp" style={{ paddingLeft: '1rem', borderLeft: '2px solid var(--primary)', marginBottom: '1.5rem' }}>
                                        <label className="form-label" style={{ fontSize: '0.9rem' }}>Max Tab Switches Allowed</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            style={{ width: '120px' }}
                                            min="0"
                                            value={quizData.settings.maxTabSwitches}
                                            onChange={(e) => handleQuizDataChange('settings.maxTabSwitches', parseInt(e.target.value) || 0)}
                                            placeholder="0 = Unlimited"
                                        />
                                        <small className="form-hint">Set to 0 for unlimited switching.</small>
                                    </div>
                                )}

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
