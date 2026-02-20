const Joi = require('joi');

const responseValidation = {
    submitAnswer: Joi.object({
        quizId: Joi.string().required(),
        questionId: Joi.string().required(),
        answer: Joi.string().required(),
        timeTaken: Joi.number().min(0).default(0)
    }),

    reportTabSwitch: Joi.object({
        quizId: Joi.string().required()
    }),

    completeQuiz: Joi.object({
        quizId: Joi.string().required()
    })
};

module.exports = responseValidation;
