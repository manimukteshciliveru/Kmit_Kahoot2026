const Joi = require('joi');

const authValidation = {
    register: Joi.object({
        name: Joi.string().min(2).max(50).required(),
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(),
        role: Joi.string().valid('student', 'faculty').default('student'),
        rollNumber: Joi.string().optional(),
        department: Joi.string().optional(),
        section: Joi.string().optional(),
        year: Joi.string().optional()
    }),

    login: Joi.object({
        email: Joi.string().required(),
        password: Joi.string().required(),
        role: Joi.string().valid('student', 'faculty', 'admin').required()
    }),

    updateProfile: Joi.object({
        name: Joi.string().min(2).max(50),
        email: Joi.string().email(),
        phone: Joi.string().allow(''),
        avatar: Joi.string().allow(''),
        currentPassword: Joi.string().min(6),
        newPassword: Joi.string().min(6)
    })
};

module.exports = authValidation;
