const rateLimit = require('express-rate-limit');

// Strict Rate Limiter for Sensitive Routes (Join Quiz, Login)
const strictLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // Limit each IP to 5 requests per windowMs
    message: {
        success: false,
        message: 'Too many attempts, please try again after a minute.'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

module.exports = strictLimiter;
