const Response = require('../models/Response');
const Quiz = require('../models/Quiz');

exports.getDetailedAnalytics = async (req, res) => {
    try {
        const { quizId } = req.params;

        // 1. Basic Stats
        const basicStats = await Response.aggregate([
            { $match: { quizId: new mongoose.Types.ObjectId(quizId), status: 'completed' } },
            {
                $group: {
                    _id: null,
                    avgScore: { $avg: '$totalScore' },
                    maxScore: { $max: '$totalScore' },
                    minScore: { $min: '$totalScore' },
                    totalParticipants: { $sum: 1 },
                    avgTime: { $avg: '$totalTimeTaken' }
                }
            }
        ]);

        // 2. Question Performance (Difficulty Index)
        const questionStats = await Response.aggregate([
            { $match: { quizId: new mongoose.Types.ObjectId(quizId) } },
            { $unwind: '$answers' },
            {
                $group: {
                    _id: '$answers.questionId',
                    correctCount: { $sum: { $cond: ['$answers.isCorrect', 1, 0] } },
                    totalAttempts: { $sum: 1 },
                    avgTime: { $avg: '$answers.timeTaken' }
                }
            },
            {
                $project: {
                    questionId: '$_id',
                    accuracy: { $multiply: [{ $divide: ['$correctCount', '$totalAttempts'] }, 100] },
                    avgTime: 1
                }
            }
        ]);

        // 3. Percentiles (using bucket or simple sort)
        const scores = await Response.find({ quizId, status: 'completed' }).select('totalScore').sort('totalScore');
        const calculatePercentile = (score) => {
            const lower = scores.filter(s => s.totalScore < score).length;
            return (lower / scores.length) * 100;
        };

        // 4. Topic Analysis (requiring questions to have tags/categories - simplified here)
        // If questions don't have tags, we group by question index ranges (e.g. Q1-5 = Section 1)

        res.status(200).json({
            success: true,
            data: {
                overview: basicStats[0] || {},
                questionPerformance: questionStats,
                percentiles: {
                    p90: scores[Math.floor(scores.length * 0.9)]?.totalScore || 0,
                    p50: scores[Math.floor(scores.length * 0.5)]?.totalScore || 0,
                }
            }
        });

    } catch (error) {
        console.error('Analytics Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

const mongoose = require('mongoose');
