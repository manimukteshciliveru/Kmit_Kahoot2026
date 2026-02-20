const Joi = require('joi');

const aiValidation = {
    generateFromFile: Joi.object({
        count: Joi.number().min(1).max(50).default(10),
        difficulty: Joi.string().valid('easy', 'medium', 'hard', 'advanced').default('medium'),
        type: Joi.string().valid('mcq', 'msq', 'fill-blank', 'qa', 'mixed').default('mcq'),
        topic: Joi.string().allow(''),
        quizId: Joi.string().allow('')
    }),

    generateFromText: Joi.object({
        text: Joi.string().min(50).required(),
        count: Joi.number().min(1).max(50).default(10),
        difficulty: Joi.string().valid('easy', 'medium', 'hard', 'advanced').default('medium'),
        type: Joi.string().valid('mcq', 'msq', 'fill-blank', 'qa', 'mixed').default('mcq'),
        topic: Joi.string().allow(''),
        quizId: Joi.string().allow('')
    })
};

module.exports = aiValidation;
