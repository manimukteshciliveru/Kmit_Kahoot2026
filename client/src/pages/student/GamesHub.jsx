import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FiZap, FiLayers, FiTarget, FiTrendingUp, FiAward } from 'react-icons/fi';
import './GamesHub.css';

const GamesHub = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const games = [
        {
            id: 'battle',
            title: '1v1 Battle Arena',
            description: 'Challenge other students in a real-time high-speed quiz duel. Winner takes all!',
            icon: <FiZap />,
            color: '#EF4444',
            path: '/student/battle',
            tag: 'LIVE'
        },
        {
            id: 'flashcards',
            title: 'AI Flashcards',
            description: 'AI-powered study sets. Master any subject with active recall and spaced repetition.',
            icon: <FiLayers />,
            color: '#3B82F6',
            path: '/student/flashcards',
            tag: 'SOLO'
        },
        {
            id: 'survival',
            title: 'Survival Mode',
            description: 'How long can you last? One wrong answer and you are out. Build your record streak!',
            icon: <FiTrendingUp />,
            color: '#FDE047',
            path: '/student/survival',
            tag: 'NEW'
        }
    ];

    return (
        <div className="games-hub animate-fadeIn">
            <header className="hub-header">
                <div className="hub-title-section">
                    <FiTarget className="hub-main-icon" />
                    <div>
                        <h1>Game Center</h1>
                        <p>Elevate your learning through high-stakes gamification</p>
                    </div>
                </div>
                <div className="hub-stats">
                    <div className="hub-stat-item arena">
                        <FiAward />
                        <div className="hub-stat-text">
                            <span className="label">Arena Rank</span>
                            <span className="value">{user?.rank?.tier || 'Bronze'} {user?.rank?.level || 'I'}</span>
                        </div>
                    </div>
                    {user?.rank?.winStreak > 0 && (
                        <div className="hub-stat-item streak">
                            <FiZap />
                            <div className="hub-stat-text">
                                <span className="label">Win Streak</span>
                                <span className="value">{user?.rank?.winStreak} WINS</span>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            <div className="games-grid">
                {games.map((game) => (
                    <div 
                        key={game.id} 
                        className={`game-card ${game.disabled ? 'disabled' : ''}`}
                        onClick={() => !game.disabled && navigate(game.path)}
                    >
                        <div className="game-card-inner">
                            <div className="game-card-icon" style={{ backgroundColor: `${game.color}15`, color: game.color }}>
                                {game.icon}
                            </div>
                            <div className="game-card-body">
                                <div className="game-header">
                                    <h3>{game.title}</h3>
                                    <span className={`game-tag ${game.tag.toLowerCase().replace(' ', '-')}`}>
                                        {game.tag}
                                    </span>
                                </div>
                                <p>{game.description}</p>
                                <div className="game-card-footer">
                                    <button className="btn-launch">
                                        Launch Game
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default GamesHub;
