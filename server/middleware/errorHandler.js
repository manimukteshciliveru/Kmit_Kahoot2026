const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    // Log the full error to the logger (file + console)
    logger.error(`${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
    if (err.stack) {
        logger.error(err.stack);
    }

    const statusCode = err.status || 500;

    // Standard Production Response (Hides stack trace)
    const response = {
        success: false,
        message: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }), // Only show stack in dev
    };

    // Specific Error Handling for common cases

    // Mongoose Validation Error
    if (err.name === 'ValidationError') {
        response.message = Object.values(err.errors).map(val => val.message).join(', ');
        res.status(400).json(response);
        return;
    }

    // Mongoose Duplicate Key
    if (err.code === 11000) {
        response.message = `Duplicate field value entered: ${Object.keys(err.keyValue)}`;
        res.status(400).json(response);
        return;
    }

    // JWT Errors
    if (err.name === 'JsonWebTokenError') {
        response.message = 'Invalid token. Please log in again.';
        res.status(401).json(response);
        return;
    }

    if (err.name === 'TokenExpiredError') {
        response.message = 'Your token has expired. Please log in again.';
        res.status(401).json(response);
        return;
    }

    res.status(statusCode).json(response);
};

module.exports = errorHandler;
