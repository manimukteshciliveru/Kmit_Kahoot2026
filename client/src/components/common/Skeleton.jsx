import React from 'react';
import './Skeleton.css';

/**
 * Skeleton Loader Component
 * @param {string} type - 'text' | 'rect' | 'circle'
 * @param {string|number} width - e.g. '100%', '50px'
 * @param {string|number} height - e.g. '1em', '200px'
 * @param {string} className - Additional classes
 */
const Skeleton = ({ type = 'text', width, height, className = '' }) => {
    const style = {
        width,
        height,
    };

    return (
        <div
            className={`skeleton skeleton-${type} ${className}`}
            style={style}
            role="status"
            aria-label="Loading..."
        />
    );
};

export default Skeleton;
