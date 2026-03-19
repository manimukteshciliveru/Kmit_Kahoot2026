import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { 
    FiLayers, 
    FiPlus, 
    FiRotateCcw, 
    FiCheckCircle, 
    FiXCircle, 
    FiArrowRight, 
    FiArrowLeft,
    FiCpu,
    FiTrash2,
    FiBookOpen
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
    
    // AI Form State
    const [aiTopic, setAiTopic] = useState('');
    const [aiSubject, setAiSubject] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

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

    const handleGenerateAI = async (e) => {
        e.preventDefault();
        if (!aiTopic || !aiSubject) return toast.error('Please fill in all fields');
        
        setIsGenerating(true);
        try {
            const response = await flashcardAPI.generate({ topic: aiTopic, subject: aiSubject });
            const newCards = response.data.data;
            
            // Auto-save the generated set
            await flashcardAPI.create({
                title: `${aiTopic} Quick Study`,
                subject: aiSubject,
                cards: newCards
            });
            
            toast.success('AI Flashcards Ready!');
            setShowCreateModal(false);
            fetchSets();
        } catch (error) {
            toast.error('AI Generation failed');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleMasteryUpdate = async (confidence) => {
        try {
            await flashcardAPI.updateMastery({
                setId: activeSet._id,
                cardIndex: currentIndex,
                confidence
            });
            
            // Move to next card
            if (currentIndex < activeSet.cards.length - 1) {
                nextCard();
            } else {
                toast.success('Session Complete!');
                setActiveSet(null);
            }
        } catch (error) {
            console.error('Mastery update failed');
        }
    };

    const nextCard = () => {
        setIsFlipped(false);
        setTimeout(() => {
            setCurrentIndex(prev => (prev + 1) % activeSet.cards.length);
        }, 150);
    };

    const prevCard = () => {
        setIsFlipped(false);
        setTimeout(() => {
            setCurrentIndex(prev => (prev - 1 + activeSet.cards.length) % activeSet.cards.length);
        }, 150);
    };

    const deleteSet = async (id, e) => {
        e.stopPropagation();
        if (!window.confirm('Delete this set?')) return;
        try {
            await flashcardAPI.delete(id);
            setSets(sets.filter(s => s._id !== id));
            toast.success('Set deleted');
        } catch (error) {
            toast.error('Delete failed');
        }
    };

    if (loading) return <div className="flash-loading">Loading Arena...</div>;

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

            {showCreateModal && (
                <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
                    <div className="modal-content animate-popIn" onClick={e => e.stopPropagation()}>
                        <h2>🚀 AI Flashcard Generator</h2>
                        <form onSubmit={handleGenerateAI}>
                            <div className="input-group">
                                <label>Topic</label>
                                <input 
                                    placeholder="e.g. React Hooks, Photosynthesis..." 
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
                            <button type="submit" className="btn-submit-ai" disabled={isGenerating}>
                                {isGenerating ? 'AI is thinking...' : 'Generate Power Deck'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Flashcards;
