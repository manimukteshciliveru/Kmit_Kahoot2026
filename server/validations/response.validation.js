const Joi = require('joi');

const responseValidation = {
    submitAnswer: Joi.object({
        quizId: Joi.string().required(),
        questionId: Joi.string().required(),
        answer: Joi.string().required(),
        timeTaken: Joi.number().min(0).default(0)
    }),

    reportTabSwitch: Joi.object({
        quizId: Joi.string().required(),
        switchCount: Joi.number().optional()
    }),

    completeQuiz: Joi.object({
        quizId: Joi.string().required(),
        answers: Joi.object().optional().unknown(true)
    })
};

module.exports = responseValidation;
