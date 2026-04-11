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
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                padding: '2rem',
                textAlign: 'center',
                fontFamily: "'Outfit', 'Inter', sans-serif"
            }}>
                <FiMonitor style={{ fontSize: '4rem', color: '#6366F1', marginBottom: '1.5rem' }} />
                <h1 style={{ fontSize: '1.8rem', marginBottom: '1rem', fontWeight: 700, letterSpacing: '-0.5px' }}>
                    Larger Screen Required
                </h1>
                <p style={{ fontSize: '1rem', color: '#94A3B8', lineHeight: 1.6, maxWidth: '400px' }}>
                    KMIT Kahoot! is designed for an immersive, data-rich experience. 
                    <br/><br/>
                    Please open this platform on a <strong>Tablet, Laptop, or Desktop Computer</strong> to continue.
                </p>
                <div style={{
                    marginTop: '2rem',
                    padding: '0.8rem 1.5rem',
                    background: 'rgba(99, 102, 241, 0.1)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    borderRadius: '12px',
                    color: '#818CF8',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    letterSpacing: '1px'
                }}>
                    SUPPORTED: &ge; 768px
                </div>
            </div>
        );
    }

    return children;
};

export default DeviceRestriction;
