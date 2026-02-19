const fs = require('fs');
const path = require('path');

// Ensure log directory exists
const logDir = path.join(__dirname, '../logs');
try {
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
} catch (err) {
    console.warn('⚠️ [LOGGER] Failed to create log directory (likely read-only fs):', err.message);
}

const errorLogPath = path.join(logDir, 'error.log');

const logger = {
    error: (message, error) => {
        const timestamp = new Date().toISOString();
        const errorMessage = error instanceof Error ? error.stack : JSON.stringify(error);
        const logEntry = `[${timestamp}] [ERROR] ${message}\nDetails: ${errorMessage}\n\n`;

        console.error(`[${timestamp}] [ERROR] ${message}`, error); // Keep console logging

        try {
            fs.appendFile(errorLogPath, logEntry, (err) => {
                if (err) console.error('Failed to write to log file:', err.message);
            });
        } catch (e) {
            // Ignore file write errors for read-only fs
        }
    },

    warn: (message, meta) => {
        const timestamp = new Date().toISOString();
        const details = meta ? JSON.stringify(meta) : '';
        const logEntry = `[${timestamp}] [WARN] ${message} ${details}\n`;

        console.warn(`[${timestamp}] [WARN] ${message}`, meta);

        try {
            fs.appendFile(errorLogPath, logEntry, (err) => {
                if (err) console.error('Failed to write to log file:', err.message);
            });
        } catch (e) {
            // Ignore file write errors for read-only fs
        }
    },

    info: (message) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [INFO] ${message}`);
    }
};

module.exports = logger;
