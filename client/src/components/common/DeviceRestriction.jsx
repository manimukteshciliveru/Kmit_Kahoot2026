import React, { useState, useEffect } from 'react';
import { FiMonitor } from 'react-icons/fi';

const DeviceRestriction = ({ children }) => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
        };
        
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    if (isMobile) {
        return (
            <div style={{
                height: '100vh',
                width: '100vw',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                padding: '2rem',
                textAlign: 'center',
                fontFamily: 'var(--font-game)'
            }}>
                <FiMonitor style={{ fontSize: '5rem', color: 'var(--kahoot-yellow)', marginBottom: '1.5rem', filter: 'drop-shadow(0 0 20px rgba(255, 204, 2, 0.4))' }} />
                <h1 style={{ fontSize: '1.8rem', marginBottom: '1rem', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>
                    Larger Screen Required
                </h1>
                <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: '400px' }}>
                    KMIT Kahoot! is designed for an immersive, data-rich experience. 
                    <br/><br/>
                    Please open this platform on a <strong style={{color: 'var(--accent)'}}>Tablet, Laptop, or Desktop Computer</strong> to continue.
                </p>
                <div style={{
                    marginTop: '2.5rem',
                    padding: '0.8rem 1.5rem',
                    background: 'var(--bg-card-light)',
                    border: '1px solid var(--border-focus)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    letterSpacing: '1px',
                    boxShadow: 'var(--shadow-md)'
                }}>
                    SUPPORTED RESOLUTION: &ge; 768px
                </div>
            </div>
        );
    }

    return children;
};

export default DeviceRestriction;
