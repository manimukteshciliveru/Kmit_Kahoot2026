import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { 
    FiLayers, FiRotateCcw, FiCheckCircle, FiXCircle, 
    FiArrowRight, FiArrowLeft, FiCpu, FiTrash2, FiBookOpen,
    FiFileText, FiUploadCloud, FiAlignLeft, FiTag, FiX
} from 'react-icons/fi';
import { flashcardAPI } from '../../services/api';
import './Flashcards.css';

const Flashcards = () => {
    const [sets, setSets] = useState([]);
    const [activeSet, setActiveSet] = useState(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    
    // Modal tab state
    const [activeTab, setActiveTab] = useState('topic'); // 'topic' | 'paste' | 'file'

    // Topic mode state
    const [aiTopic, setAiTopic] = useState('');
    const [aiSubject, setAiSubject] = useState('');

    // Paste mode state
    const [pastedContent, setPastedContent] = useState('');
    const [pasteSubject, setPasteSubject] = useState('');

    // File mode state
    const [selectedFile, setSelectedFile] = useState(null);
    const [fileSubject, setFileSubject] = useState('');
    const [isDragging, setIsDragging] = useState(false);

    const [isGenerating, setIsGenerating] = useState(false);
    const [cardCount, setCardCount] = useState(10);
    const fileInputRef = useRef(null);

    useEffect(() => {
        fetchSets();
    }, []);

    const fetchSets = async () => {
        try {
            const response = await flashcardAPI.getAll();
            setSets(response.data.data);
        } catch (error) {
            toast.error('Failed to load flashcard sets');
        } finally {
            setLoading(false);
        }
    };

    const handleGenerate = async (e) => {
        e.preventDefault();
        setIsGenerating(true);

        try {
            let response;
            let title = '';

            if (activeTab === 'topic') {
                if (!aiTopic || !aiSubject) return toast.error('Please fill in topic and subject');
                response = await flashcardAPI.generate({ 
                    topic: aiTopic, subject: aiSubject, 
                    count: cardCount, mode: 'topic' 
                });
                title = `${aiTopic} Quick Study`;

            } else if (activeTab === 'paste') {
                if (!pastedContent.trim()) return toast.error('Please paste some content');
                response = await flashcardAPI.generate({ 
                    content: pastedContent, 
                    subject: pasteSubject || 'General',
                    count: cardCount, mode: 'content'
                });
                title = `${pasteSubject || 'Content'} Study Set`;

            } else if (activeTab === 'file') {
                if (!selectedFile) return toast.error('Please select a file');
                const formData = new FormData();
                formData.append('file', selectedFile);
                formData.append('subject', fileSubject || selectedFile.name.replace(/\.[^.]+$/, ''));
                formData.append('count', cardCount);
                formData.append('mode', 'file');
                response = await flashcardAPI.generateFromFile(formData);
                title = `${fileSubject || selectedFile.name.replace(/\.[^.]+$/, '')} Study Set`;
            }

            const newCards = response.data.data;
            await flashcardAPI.create({
                title,
                subject: aiSubject || pasteSubject || fileSubject || 'General',
                cards: newCards
            });

            toast.success(`✅ ${newCards.length} flashcards created!`);
            setShowCreateModal(false);
            resetModal();
            fetchSets();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Generation failed. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    const resetModal = () => {
        setAiTopic(''); setAiSubject('');
        setPastedContent(''); setPasteSubject('');
        setSelectedFile(null); setFileSubject('');
        setActiveTab('topic');
    };

    const handleMasteryUpdate = async (confidence) => {
        try {
            await flashcardAPI.updateMastery({
                setId: activeSet._id,
                cardIndex: currentIndex,
                confidence
            });
            if (currentIndex < activeSet.cards.length - 1) {
                nextCard();
            } else {
                toast.success('🎉 Session Complete!');
                setActiveSet(null);
            }
        } catch (error) {
            console.error('Mastery update failed');
        }
    };

    const nextCard = () => {
        setIsFlipped(false);
        setTimeout(() => setCurrentIndex(prev => (prev + 1) % activeSet.cards.length), 150);
    };

    const prevCard = () => {
        setIsFlipped(false);
        setTimeout(() => setCurrentIndex(prev => (prev - 1 + activeSet.cards.length) % activeSet.cards.length), 150);
    };

    const deleteSet = async (id, e) => {
        e.stopPropagation();
        if (!window.confirm('Delete this set?')) return;
        try {
            await flashcardAPI.delete(id);
            setSets(sets.filter(s => s._id !== id));
            toast.success('Set deleted');
        } catch {
            toast.error('Delete failed');
        }
    };

    // Drag and drop handlers
    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = () => setIsDragging(false);
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) setSelectedFile(file);
    };

    if (loading) return <div className="flash-loading"><div className="spinner"></div></div>;

    return (
        <div className="flash-container">
            <header className="flash-header">
                <div className="header-info">
                    <h1><FiLayers className="title-icon" /> Learning Flashcards</h1>
                    <p>Master concepts with AI-powered active recall</p>
                </div>
                <button className="btn-create-ai" onClick={() => setShowCreateModal(true)}>
                    <FiCpu /> Create with AI
                </button>
            </header>

            {!activeSet ? (
                <div className="flash-grid animate-fadeIn">
                    {sets.length === 0 ? (
                        <div className="empty-state">
                            <FiBookOpen className="empty-icon" />
                            <h3>No flashcards yet</h3>
                            <p>Generate some using AI to start learning!</p>
                            <button className="btn-create-ai" onClick={() => setShowCreateModal(true)}>
                                <FiCpu /> Create First Set
                            </button>
                        </div>
                    ) : (
                        sets.map(set => (
                            <div key={set._id} className="set-card" onClick={() => { setActiveSet(set); setCurrentIndex(0); }}>
                                <div className="set-badge">{set.subject}</div>
                                <h3>{set.title}</h3>
                                <div className="set-footer">
                                    <span>{set.cards.length} Cards</span>
                                    <button className="btn-delete-small" onClick={(e) => deleteSet(set._id, e)}>
                                        <FiTrash2 />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                <div className="active-study animate-zoomIn">
                    <button className="btn-back" onClick={() => setActiveSet(null)}>
                        <FiArrowLeft /> Back to Gallery
                    </button>
                    
                    <div className="study-progress">
                        Card {currentIndex + 1} of {activeSet.cards.length}
                        <div className="progress-bar-bg">
                            <div className="progress-fill" style={{ width: `${((currentIndex + 1) / activeSet.cards.length) * 100}%` }}></div>
                        </div>
                    </div>

                    <div className={`flip-card ${isFlipped ? 'is-flipped' : ''}`} onClick={() => setIsFlipped(!isFlipped)}>
                        <div className="flip-card-inner">
                            <div className="flip-card-front">
                                <span className="card-label">QUESTION</span>
                                <h2>{activeSet.cards[currentIndex].question}</h2>
                                <p className="hint"><FiRotateCcw /> Click to reveal answer</p>
                            </div>
                            <div className="flip-card-back">
                                <span className="card-label">ANSWER</span>
                                <div className="answer-content">
                                    <p>{activeSet.cards[currentIndex].answer}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="study-controls">
                        <button className="btn-nav" onClick={(e) => { e.stopPropagation(); prevCard(); }}><FiArrowLeft /></button>
                        {isFlipped && (
                            <div className="mastery-buttons animate-fadeInUp">
                                <button className="btn-mastery hard" onClick={() => handleMasteryUpdate(1)}>
                                    <FiXCircle /> Hard
                                </button>
                                <button className="btn-mastery easy" onClick={() => handleMasteryUpdate(5)}>
                                    <FiCheckCircle /> Got it!
                                </button>
                            </div>
                        )}
                        <button className="btn-nav" onClick={(e) => { e.stopPropagation(); nextCard(); }}><FiArrowRight /></button>
                    </div>
                </div>
            )}

            {/* ===== ENHANCED CREATE MODAL ===== */}
            {showCreateModal && (
                <div className="modal-overlay" onClick={() => { setShowCreateModal(false); resetModal(); }}>
                    <div className="modal-content animate-popIn" onClick={e => e.stopPropagation()}>
                        <div className="modal-top">
                            <div>
                                <h2>🚀 AI Flashcard Generator</h2>
                                <p className="modal-subtitle">Choose how to generate your study deck</p>
                            </div>
                            <button className="modal-close" onClick={() => { setShowCreateModal(false); resetModal(); }}>
                                <FiX />
                            </button>
                        </div>

                        {/* Tab Switcher */}
                        <div className="gen-tabs">
                            <button 
                                className={`gen-tab ${activeTab === 'topic' ? 'active' : ''}`}
                                onClick={() => setActiveTab('topic')}
                            >
                                <FiTag /> Topic / Keyword
                            </button>
                            <button 
                                className={`gen-tab ${activeTab === 'paste' ? 'active' : ''}`}
                                onClick={() => setActiveTab('paste')}
                            >
                                <FiAlignLeft /> Paste Content
                            </button>
                            <button 
                                className={`gen-tab ${activeTab === 'file' ? 'active' : ''}`}
                                onClick={() => setActiveTab('file')}
                            >
                                <FiUploadCloud /> Upload File
                            </button>
                        </div>

                        <form onSubmit={handleGenerate}>
                            {/* ---- TAB 1: TOPIC ---- */}
                            {activeTab === 'topic' && (
                                <div className="tab-panel">
                                    <div className="input-group">
                                        <label>Topic</label>
                                        <input 
                                            placeholder="e.g. React Hooks, Photosynthesis, Binary Trees..." 
                                            value={aiTopic} 
                                            onChange={e => setAiTopic(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Subject</label>
                                        <input 
                                            placeholder="e.g. Computer Science, Biology..." 
                                            value={aiSubject} 
                                            onChange={e => setAiSubject(e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* ---- TAB 2: PASTE CONTENT ---- */}
                            {activeTab === 'paste' && (
                                <div className="tab-panel">
                                    <div className="input-group">
                                        <label>Subject (optional)</label>
                                        <input 
                                            placeholder="e.g. Physics, History..." 
                                            value={pasteSubject} 
                                            onChange={e => setPasteSubject(e.target.value)}
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Paste your content</label>
                                        <textarea
                                            className="content-textarea"
                                            placeholder="Paste lecture notes, article text, study material... AI will extract key concepts and create Q&A pairs."
                                            value={pastedContent}
                                            onChange={e => setPastedContent(e.target.value)}
                                            rows={8}
                                        />
                                        <small className="char-count">{pastedContent.length} / 8000 chars</small>
                                    </div>
                                </div>
                            )}

                            {/* ---- TAB 3: FILE UPLOAD ---- */}
                            {activeTab === 'file' && (
                                <div className="tab-panel">
                                    <div className="input-group">
                                        <label>Subject (optional)</label>
                                        <input 
                                            placeholder="e.g. Physics, History..." 
                                            value={fileSubject} 
                                            onChange={e => setFileSubject(e.target.value)}
                                        />
                                    </div>
                                    <div 
                                        className={`drop-zone ${isDragging ? 'dragging' : ''} ${selectedFile ? 'has-file' : ''}`}
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onDrop={handleDrop}
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <input 
                                            type="file" 
                                            ref={fileInputRef}
                                            hidden
                                            accept=".pdf,.docx,.doc,.pptx,.ppt,.txt"
                                            onChange={e => setSelectedFile(e.target.files[0])}
                                        />
                                        {selectedFile ? (
                                            <div className="file-selected">
                                                <FiFileText className="file-icon" />
                                                <span className="file-name">{selectedFile.name}</span>
                                                <span className="file-size">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                                                <button 
                                                    type="button" 
                                                    className="remove-file"
                                                    onClick={e => { e.stopPropagation(); setSelectedFile(null); }}
                                                >
                                                    <FiX />
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <FiUploadCloud className="upload-icon" />
                                                <p>Drag & drop or click to upload</p>
                                                <small>Supports PDF, DOCX, PPTX, TXT — up to 15MB</small>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Card count control */}
                            <div className="card-count-row">
                                <label>Number of cards: <strong>{cardCount}</strong></label>
                                <input 
                                    type="range" min="5" max="30" value={cardCount}
                                    onChange={e => setCardCount(Number(e.target.value))}
                                    className="count-slider"
                                />
                            </div>

                            <button type="submit" className="btn-submit-ai" disabled={isGenerating}>
                                {isGenerating ? (
                                    <><div className="btn-spinner"></div> AI is generating...</>
                                ) : (
                                    <><FiCpu /> Generate {cardCount} Flashcards</>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Flashcards;
