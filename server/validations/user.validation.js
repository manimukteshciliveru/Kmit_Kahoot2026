const Joi = require('joi');

const userValidation = {
    createUser: Joi.object({
        name: Joi.string().min(2).max(50).required(),
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(),
        role: Joi.string().valid('student', 'faculty', 'admin').default('student'),
        studentId: Joi.string().allow(''),
        rollNumber: Joi.string().allow(''),
        department: Joi.string().allow(''),
        year: Joi.string().allow(''),
        section: Joi.string().allow(''),
        phone: Joi.string().allow(''),
        employeeId: Joi.string().allow(''),
        designation: Joi.string().allow(''),
        subjects: Joi.string().allow('')
    }),

    updateUser: Joi.object({
        name: Joi.string().min(2).max(50),
        email: Joi.string().email(),
        role: Joi.string().valid('student', 'faculty', 'admin'),
        isActive: Joi.boolean(),
        studentId: Joi.string().allow(''),
        rollNumber: Joi.string().allow(''),
        department: Joi.string().allow(''),
        year: Joi.string().allow(''),
        section: Joi.string().allow(''),
        phone: Joi.string().allow(''),
        employeeId: Joi.string().allow(''),
        designation: Joi.string().allow(''),
        subjects: Joi.string().allow('')
    })
};

module.exports = userValidation;
