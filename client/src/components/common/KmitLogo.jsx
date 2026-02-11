import React, { useState } from 'react';

const KmitLogo = ({ className, height = "40px", style, ...props }) => {
    // We use the file path expected in the public folder
    const logoSrc = "/kmit-logo.png";
    const [error, setError] = useState(false);

    if (error) {
        // Fallback text if image is not yet saved
        return (
            <div
                className={className}
                style={{
                    height,
                    display: 'flex',
                    alignItems: 'center',
                    color: '#FF6500',
                    fontWeight: 'bold',
                    fontSize: '1.5rem',
                    ...style
                }}
                {...props}
            >
                KMIT
            </div>
        );
    }

    return (
        <img
            src={logoSrc}
            alt="KMIT Logo"
            className={className}
            style={{ height, width: 'auto', ...style }}
            onError={() => setError(true)}
            {...props}
        />
    );
};

export default KmitLogo;
