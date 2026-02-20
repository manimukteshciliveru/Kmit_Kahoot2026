const winston = require('winston');
const path = require('path');

// Custom log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

// Log level based on environment
const level = () => {
    const env = process.env.NODE_ENV || 'development';
    return env === 'development' ? 'debug' : 'warn';
};

// Colors for console output
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
};

winston.addColors(colors);

// Format for logs
const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.colorize({ all: true }),
    winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)
);

// Transports (Console + Files)
const transports = [
    // Console - Always logs
    new winston.transports.Console(),

    // File - Error logs
    new winston.transports.File({
        filename: path.join(__dirname, '../logs/error.log'),
        level: 'error',
        format: winston.format.uncolorize(), // No colors in file
    }),

    // File - All logs
    new winston.transports.File({
        filename: path.join(__dirname, '../logs/all.log'),
        format: winston.format.uncolorize(),
    }),
];

const logger = winston.createLogger({
    level: level(),
    levels,
    format,
    transports,
});

module.exports = logger;
