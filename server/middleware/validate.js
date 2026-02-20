const Joi = require('joi');

// Middleware to validate request body against a Joi schema
const validate = (schema) => (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
        abortEarly: false, // Return all errors
        allowUnknown: true, // Allow extra fields but ignore them (or false to strict)
        stripUnknown: true, // Remove unknown fields
    });

    if (error) {
        const errorMessages = error.details.map((detail) => detail.message).join(', ');
        const err = new Error(errorMessages);
        err.status = 400;
        return next(err); // Pass to global error handler
    }

    // Replace req.body with the sanitized/validated value
    req.body = value;
    return next();
};

module.exports = validate;
