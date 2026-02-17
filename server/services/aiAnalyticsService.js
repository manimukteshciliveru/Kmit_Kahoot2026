const { GoogleGenerativeAI } = require('@google/generative-ai');
const Response = require('../models/Response');
const Quiz = require('../models/Quiz');

class AIAnalyticsService {
    constructor() {
        this.genAI = null;
        this.model = null;
        this.initialize();
    }

    initialize() {
        if (process.env.GOOGLE_AI_API_KEY) {
            this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
            this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        }
    }

    async generateStudentSummary(quizId, userId) {
        if (!this.model) {
            console.warn('AI Service not initialized');
            return null;
        }

        try {
            const response = await Response.findOne({ quizId, userId }).lean();
            const quiz = await Quiz.findById(quizId).lean();

            if (!response || !quiz) return null;

            // Construct Prompt
            const answers = response.answers.map((a, i) => {
                const q = quiz.questions.find(q => q._id.toString() === a.questionId.toString());
                return `Q${i + 1}: ${q ? q.text : 'Unknown'} | Status: ${a.isCorrect ? 'Correct' : 'Wrong'} | Time: ${a.timeTaken}ms`;
            }).join('\n');

            const prompt = `
            Analyze the following student performance for the quiz "${quiz.title}".
            
            Student Stats:
            - Score: ${response.totalScore}
            - Accuracy: ${response.percentage}%
            - Time: ${Math.round(response.totalTimeTaken / 1000)}s
            
            Question Log:
            ${answers}
            
            Task:
            1. Identify 2 strong topics.
            2. Identify 2 weak areas.
            3. Provide a 2-sentence actionable tip for improvement.
            
            Output Format: JSON
            {
                "strengths": ["...", "..."],
                "weaknesses": ["...", "..."],
                "tip": "..."
            }
            `;

            const result = await this.model.generateContent(prompt);
            const text = result.response.text();

            // Clean markdown
            const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim();
            return JSON.parse(jsonStr);

        } catch (error) {
            console.error('AI Summary Generation Error:', error);
            return null;
        }
    }
}

module.exports = new AIAnalyticsService();
