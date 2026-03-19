import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { 
    FiLayers, FiRotateCcw, FiCheckCircle, FiXCircle, 
    FiArrowRight, FiArrowLeft, FiCpu, FiTrash2, FiBookOpen,
    FiFileText, FiUploadCloud, FiAlignLeft, FiTag, FiX,
    FiZap, FiTrendingUp, FiStar
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
    const [activeTab, setActiveTab] = useState('topic');

    const [aiTopic, setAiTopic] = useState('');
    const [aiSubject, setAiSubject] = useState('');
    const [pastedContent, setPastedContent] = useState('');
    const [pasteSubject, setPasteSubject] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [fileSubject, setFileSubject] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [cardCount, setCardCount] = useState(10);
    const fileInputRef = useRef(null);

    useEffect(() => { fetchSets(); }, []);

    const fetchSets = async () => {
        try {
            const response = await flashcardAPI.getAll();
            setSets(response.data.data || []);
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
            let response, title = '';
            if (activeTab === 'topic') {
                if (!aiTopic || !aiSubject) { toast.error('Please fill topic & subject'); setIsGenerating(false); return; }
                response = await flashcardAPI.generate({ topic: aiTopic, subject: aiSubject, count: cardCount, mode: 'topic' });
                title = `${aiTopic} — Study Set`;
            } else if (activeTab === 'paste') {
                if (!pastedContent.trim()) { toast.error('Please paste some content'); setIsGenerating(false); return; }
                response = await flashcardAPI.generate({ content: pastedContent, subject: pasteSubject || 'General', count: cardCount, mode: 'content' });
                title = `${pasteSubject || 'Content'} — Study Set`;
            } else {
                if (!selectedFile) { toast.error('Please select a file'); setIsGenerating(false); return; }
                const fd = new FormData();
                fd.append('file', selectedFile);
                fd.append('subject', fileSubject || selectedFile.name.replace(/\.[^.]+$/, ''));
                fd.append('count', cardCount);
                fd.append('mode', 'file');
                response = await flashcardAPI.generateFromFile(fd);
                title = `${fileSubject || selectedFile.name.replace(/\.[^.]+$/, '')} — Study Set`;
            }
            const cards = response.data.data;
            await flashcardAPI.create({ title, subject: aiSubject || pasteSubject || fileSubject || 'General', cards });
            toast.success(`✅ ${cards.length} flashcards ready!`);
            setShowCreateModal(false);
            resetModal();
            fetchSets();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Generation failed. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    const resetModal = () => {
        setAiTopic(''); setAiSubject('');
        setPastedContent(''); setPasteSubject('');
        setSelectedFile(null); setFileSubject('');
        setActiveTab('topic'); setCardCount(10);
    };

    const handleMasteryUpdate = async (confidence) => {
        try {
            await flashcardAPI.updateMastery({ setId: activeSet._id, cardIndex: currentIndex, confidence });
            if (currentIndex < activeSet.cards.length - 1) nextCard();
            else { toast.success('🎉 Session Complete!'); setActiveSet(null); }
        } catch { console.error('Mastery update failed'); }
    };

    const nextCard = () => { setIsFlipped(false); setTimeout(() => setCurrentIndex(p => (p + 1) % activeSet.cards.length), 150); };
    const prevCard = () => { setIsFlipped(false); setTimeout(() => setCurrentIndex(p => (p - 1 + activeSet.cards.length) % activeSet.cards.length), 150); };

    const deleteSet = async (id, e) => {
        e.stopPropagation();
        if (!window.confirm('Delete this flashcard set?')) return;
        try {
            await flashcardAPI.delete(id);
            setSets(sets.filter(s => s._id !== id));
            toast.success('Set deleted');
        } catch { toast.error('Delete failed'); }
    };

    const handleDragOver  = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = ()  => setIsDragging(false);
    const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) setSelectedFile(f); };

    /* ── colour palette for set cards ── */
    const palette = ['#6366F1','#8B5CF6','#EC4899','#3B82F6','#10B981','#F59E0B','#EF4444'];
    const getColor = (i) => palette[i % palette.length];

    if (loading) return (
        <div className="fc-loading">
            <div className="fc-spinner"></div>
            <p>Loading your flashcards…</p>
        </div>
    );

    return (
        <div className="fc-page">

            {/* ── PAGE HEADER ── */}
            {!activeSet && (
                <div className="fc-hero">
                    <div className="fc-hero-left">
                        <div className="fc-hero-badge"><FiZap /> AI-Powered</div>
                        <h1>Learning Flashcards</h1>
                        <p>Master any concept with active recall — paste notes, upload PDFs, or just enter a topic.</p>
                        <div className="fc-hero-stats">
                            <div className="fc-stat"><FiBookOpen /><span>{sets.length} Sets</span></div>
                            <div className="fc-stat"><FiLayers /><span>{sets.reduce((a, s) => a + s.cards.length, 0)} Cards</span></div>
                            <div className="fc-stat"><FiStar /><span>Active Recall</span></div>
                        </div>
                    </div>
                    <button className="fc-cta" onClick={() => setShowCreateModal(true)}>
                        <FiCpu /> Create with AI
                    </button>
                </div>
            )}

            {/* ── GALLERY ── */}
            {!activeSet && (
                <section className="fc-section">
                    {sets.length === 0 ? (
                        <div className="fc-empty">
                            <div className="fc-empty-icon"><FiBookOpen /></div>
                            <h3>No flashcard sets yet</h3>
                            <p>Generate your first set using AI — enter a topic, paste notes, or upload a PDF.</p>
                            <button className="fc-cta small" onClick={() => setShowCreateModal(true)}>
                                <FiCpu /> Create First Set
                            </button>
                        </div>
                    ) : (
                        <div className="fc-grid">
                            {sets.map((set, i) => (
                                <div
                                    key={set._id}
                                    className="fc-card"
                                    onClick={() => { setActiveSet(set); setCurrentIndex(0); setIsFlipped(false); }}
                                    style={{ '--accent': getColor(i) }}
                                >
                                    <div className="fc-card-stripe" />
                                    <div className="fc-card-top">
                                        <span className="fc-subject-badge">{set.subject}</span>
                                        <button className="fc-card-delete" onClick={(e) => deleteSet(set._id, e)} title="Delete set">
                                            <FiTrash2 />
                                        </button>
                                    </div>
                                    <h3 className="fc-card-title">{set.title}</h3>
                                    <div className="fc-card-meta">
                                        <span><FiLayers /> {set.cards.length} cards</span>
                                        <span className="fc-study-btn">Study →</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {/* ── ACTIVE STUDY VIEW ── */}
            {activeSet && (
                <div className="fc-study">
                    <div className="fc-study-header">
                        <button className="fc-back-btn" onClick={() => setActiveSet(null)}>
                            <FiArrowLeft /> Back
                        </button>
                        <div className="fc-study-title">
                            <h2>{activeSet.title}</h2>
                            <span>{activeSet.subject}</span>
                        </div>
                        <div className="fc-progress-label">
                            {currentIndex + 1} / {activeSet.cards.length}
                        </div>
                    </div>

                    <div className="fc-progress-track">
                        <div className="fc-progress-fill" style={{ width: `${((currentIndex + 1) / activeSet.cards.length) * 100}%` }} />
                    </div>

                    <div className="fc-study-area">
                        <div className={`fc-flip ${isFlipped ? 'flipped' : ''}`} onClick={() => setIsFlipped(!isFlipped)}>
                            <div className="fc-flip-inner">
                                <div className="fc-face fc-front">
                                    <span className="fc-face-label">QUESTION</span>
                                    <h2>{activeSet.cards[currentIndex].question}</h2>
                                    <p className="fc-hint"><FiRotateCcw /> Click card to reveal answer</p>
                                </div>
                                <div className="fc-face fc-back">
                                    <span className="fc-face-label">ANSWER</span>
                                    <p>{activeSet.cards[currentIndex].answer}</p>
                                </div>
                            </div>
                        </div>

                        <div className="fc-controls">
                            <button className="fc-nav" onClick={(e) => { e.stopPropagation(); prevCard(); }}><FiArrowLeft /></button>

                            {isFlipped ? (
                                <div className="fc-mastery">
                                    <button className="fc-m-btn hard" onClick={() => handleMasteryUpdate(1)}>
                                        <FiXCircle /> Hard
                                    </button>
                                    <button className="fc-m-btn easy" onClick={() => handleMasteryUpdate(5)}>
                                        <FiCheckCircle /> Got it!
                                    </button>
                                </div>
                            ) : (
                                <p className="fc-tap-hint">Rate after you see the answer</p>
                            )}

                            <button className="fc-nav" onClick={(e) => { e.stopPropagation(); nextCard(); }}><FiArrowRight /></button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── MODAL ── */}
            {showCreateModal && (
                <div className="fc-overlay" onClick={() => { setShowCreateModal(false); resetModal(); }}>
                    <div className="fc-modal" onClick={e => e.stopPropagation()}>

                        <div className="fc-modal-head">
                            <div>
                                <h2>🚀 AI Flashcard Generator</h2>
                                <p>Choose a generation mode and let AI do the work</p>
                            </div>
                            <button className="fc-modal-close" onClick={() => { setShowCreateModal(false); resetModal(); }}><FiX /></button>
                        </div>

                        {/* Tabs */}
                        <div className="fc-tabs">
                            {[
                                { id: 'topic', icon: <FiTag />, label: 'Topic' },
                                { id: 'paste', icon: <FiAlignLeft />, label: 'Paste Text' },
                                { id: 'file',  icon: <FiUploadCloud />, label: 'Upload File' },
                            ].map(t => (
                                <button
                                    key={t.id}
                                    className={`fc-tab ${activeTab === t.id ? 'active' : ''}`}
                                    onClick={() => setActiveTab(t.id)}
                                    type="button"
                                >
                                    {t.icon} {t.label}
                                </button>
                            ))}
                        </div>

                        <form onSubmit={handleGenerate}>
                            {/* Topic Tab */}
                            {activeTab === 'topic' && (
                                <div className="fc-tab-body">
                                    <div className="fc-field">
                                        <label>Topic *</label>
                                        <input placeholder="e.g. React Hooks, Photosynthesis, Recursion…" value={aiTopic} onChange={e => setAiTopic(e.target.value)} autoFocus />
                                    </div>
                                    <div className="fc-field">
                                        <label>Subject *</label>
                                        <input placeholder="e.g. Computer Science, Biology…" value={aiSubject} onChange={e => setAiSubject(e.target.value)} />
                                    </div>
                                </div>
                            )}

                            {/* Paste Tab */}
                            {activeTab === 'paste' && (
                                <div className="fc-tab-body">
                                    <div className="fc-field">
                                        <label>Subject <span className="opt">(optional)</span></label>
                                        <input placeholder="e.g. Physics, History…" value={pasteSubject} onChange={e => setPasteSubject(e.target.value)} />
                                    </div>
                                    <div className="fc-field">
                                        <label>Paste your content *</label>
                                        <textarea
                                            className="fc-textarea"
                                            placeholder="Paste lecture notes, article text, chapter summaries… AI extracts key Q&A pairs."
                                            value={pastedContent}
                                            onChange={e => setPastedContent(e.target.value)}
                                            rows={7}
                                        />
                                        <span className="fc-char">{pastedContent.length.toLocaleString()} / 8,000 chars</span>
                                    </div>
                                </div>
                            )}

                            {/* File Tab */}
                            {activeTab === 'file' && (
                                <div className="fc-tab-body">
                                    <div className="fc-field">
                                        <label>Subject <span className="opt">(optional)</span></label>
                                        <input placeholder="e.g. Data Structures, Law…" value={fileSubject} onChange={e => setFileSubject(e.target.value)} />
                                    </div>
                                    <div
                                        className={`fc-drop ${isDragging ? 'drag' : ''} ${selectedFile ? 'has-file' : ''}`}
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onDrop={handleDrop}
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <input type="file" ref={fileInputRef} hidden accept=".pdf,.docx,.doc,.pptx,.ppt,.txt" onChange={e => setSelectedFile(e.target.files[0])} />
                                        {selectedFile ? (
                                            <div className="fc-file-row">
                                                <FiFileText className="fc-file-ic" />
                                                <div className="fc-file-info">
                                                    <span className="fc-file-name">{selectedFile.name}</span>
                                                    <span className="fc-file-size">{(selectedFile.size / 1024).toFixed(1)} KB</span>
                                                </div>
                                                <button type="button" className="fc-file-rm" onClick={e => { e.stopPropagation(); setSelectedFile(null); }}><FiX /></button>
                                            </div>
                                        ) : (
                                            <div className="fc-drop-inner">
                                                <FiUploadCloud className="fc-drop-ic" />
                                                <p>Drag & drop or <u>click to browse</u></p>
                                                <small>PDF · DOCX · PPTX · TXT — max 15 MB</small>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Card count */}
                            <div className="fc-slider-row">
                                <label>Cards to generate: <strong>{cardCount}</strong></label>
                                <input type="range" min="5" max="30" value={cardCount} onChange={e => setCardCount(+e.target.value)} className="fc-slider" />
                            </div>

                            <button type="submit" className="fc-gen-btn" disabled={isGenerating}>
                                {isGenerating
                                    ? <><div className="fc-spin"></div> Generating…</>
                                    : <><FiZap /> Generate {cardCount} Flashcards</>
                                }
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Flashcards;
