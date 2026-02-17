const fs = require('fs');
const path = require('path');

// Ensure log directory exists
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const errorLogPath = path.join(logDir, 'error.log');

const logger = {
    error: (message, error) => {
        const timestamp = new Date().toISOString();
        const errorMessage = error instanceof Error ? error.stack : JSON.stringify(error);
        const logEntry = `[${timestamp}] [ERROR] ${message}\nDetails: ${errorMessage}\n\n`;

        console.error(`[${timestamp}] [ERROR] ${message}`, error); // Keep console logging

        fs.appendFile(errorLogPath, logEntry, (err) => {
            if (err) console.error('Failed to write to log file:', err);
        });
    },

    warn: (message, meta) => {
        const timestamp = new Date().toISOString();
        const details = meta ? JSON.stringify(meta) : '';
        const logEntry = `[${timestamp}] [WARN] ${message} ${details}\n`;

        console.warn(`[${timestamp}] [WARN] ${message}`, meta);

        fs.appendFile(errorLogPath, logEntry, (err) => {
            if (err) console.error('Failed to write to log file:', err);
        });
    },

    info: (message) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [INFO] ${message}`);
    }
};

module.exports = logger;
