const Joi = require('joi');

const quizValidation = {
    createQuiz: Joi.object({
        title: Joi.string().min(3).max(100).required(),
        subject: Joi.string().max(50).allow(''),
        description: Joi.string().max(1000).allow(''),
        mode: Joi.string().valid('mcq', 'msq', 'fill-blank', 'qa', 'mixed').default('mcq'),
        scheduledAt: Joi.date().allow(null, ''),
        settings: Joi.object({
            quizTimer: Joi.number().min(0).default(0),
            questionTimer: Joi.number().min(0).default(30),
            shuffleQuestions: Joi.boolean().default(true),
            shuffleOptions: Joi.boolean().default(true),
            showInstantFeedback: Joi.boolean().default(true),
            showLeaderboard: Joi.boolean().default(true),
            allowTabSwitch: Joi.boolean().default(false),
            maxTabSwitches: Joi.number().min(0).default(3),
            difficultyLevel: Joi.string().valid('easy', 'medium', 'hard', 'mixed').default('medium'),
            passingScore: Joi.number().min(0).max(100).default(40),
            passingScore: Joi.number().min(0).max(100).default(40),
            showCorrectAnswer: Joi.boolean().default(true),
            autoStart: Joi.boolean().default(false)
        }).allow(null),
        questions: Joi.array().items(
            Joi.object({
                text: Joi.string().required(),
                type: Joi.string().valid('mcq', 'msq', 'fill-blank', 'qa').default('mcq'),
                options: Joi.array().items(Joi.string()).allow(null),
                correctAnswer: Joi.string().required(),
                points: Joi.number().min(1).default(10),
                timeLimit: Joi.number().min(0).default(0),
                difficulty: Joi.string().valid('easy', 'medium', 'hard', 'advanced').default('medium'),
                explanation: Joi.string().allow(''),
                order: Joi.number()
            })
        ).min(1).required(),
        accessControl: Joi.object({
            isPublic: Joi.boolean().default(true),
            allowedBranches: Joi.array().items(
                Joi.object({
                    name: Joi.string().required(),
                    sections: Joi.array().items(Joi.string()).default([])
                })
            ).default([]),
            mode: Joi.string().valid('ALL', 'SPECIFIC').default('ALL'),
            allowedStudents: Joi.array().items(Joi.string()).default([])
        }).default()
    }),

    updateQuiz: Joi.object({
        title: Joi.string().min(3).max(100),
        subject: Joi.string().max(50).allow(''),
        description: Joi.string().max(1000).allow(''),
        mode: Joi.string().valid('mcq', 'msq', 'fill-blank', 'qa', 'mixed'),
        status: Joi.string().valid('draft', 'scheduled', 'active', 'completed'),
        scheduledAt: Joi.date().allow(null, ''),
        settings: Joi.object({
            quizTimer: Joi.number().min(0),
            questionTimer: Joi.number().min(0),
            shuffleQuestions: Joi.boolean(),
            shuffleOptions: Joi.boolean(),
            showInstantFeedback: Joi.boolean(),
            showLeaderboard: Joi.boolean(),
            allowTabSwitch: Joi.boolean(),
            maxTabSwitches: Joi.number().min(0),
            difficultyLevel: Joi.string().valid('easy', 'medium', 'hard', 'mixed'),
            passingScore: Joi.number().min(0).max(100),
            passingScore: Joi.number().min(0).max(100),
            showCorrectAnswer: Joi.boolean(),
            autoStart: Joi.boolean()
        }),
        questions: Joi.array().items(
            Joi.object({
                text: Joi.string(),
                type: Joi.string().valid('mcq', 'msq', 'fill-blank', 'qa'),
                options: Joi.array().items(Joi.string()).allow(null),
                correctAnswer: Joi.string(),
                points: Joi.number().min(1),
                timeLimit: Joi.number().min(0),
                difficulty: Joi.string().valid('easy', 'medium', 'hard', 'advanced'),
                explanation: Joi.string().allow(''),
                order: Joi.number()
            })
        ),
        accessControl: Joi.object({
            isPublic: Joi.boolean(),
            allowedBranches: Joi.array().items(
                Joi.object({
                    name: Joi.string().required(),
                    sections: Joi.array().items(Joi.string()).default([])
                })
            ),
            mode: Joi.string().valid('ALL', 'SPECIFIC'),
            allowedStudents: Joi.array().items(Joi.string())
        })
    })
};

module.exports = quizValidation;
