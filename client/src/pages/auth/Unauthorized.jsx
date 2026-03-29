import React from 'react';
import { useNavigate } from 'react-router-dom';

const Unauthorized = () => {
    const navigate = useNavigate();

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            padding: '2rem',
            textAlign: 'center',
            background: '#1A0533',
            color: 'white'
        }}>
            <h1 style={{ fontSize: '4rem', color: '#E21B3C' }}>403</h1>
            <h2>Access Denied</h2>
            <p>You do not have permission to view this page.</p>
            <button 
                className="btn-primary" 
                onClick={() => navigate('/')}
                style={{ marginTop: '2rem' }}
            >
                Return Home
            </button>
        </div>
    );
};

export default Unauthorized;
