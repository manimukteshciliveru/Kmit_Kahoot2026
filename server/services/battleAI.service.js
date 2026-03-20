const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY);

const generateBattleQuiz = async (topic) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        
        const prompt = `Generate exactly 5 highly competitive multiple choice questions about "${topic}".
        Rules:
        1. Mix of medium and hard difficulty.
        2. Format as JSON array.
        3. Each object should have: questionText, options (array of 4 strings), correctAnswer (index 0-3), difficulty.
        
        JSON only.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();
        
        // Sanitize for JSON parsing
        text = text.replace(/```json|```/g, "").trim();
        const questions = JSON.parse(text);

        return {
            topic: topic,
            questions: questions.map(q => ({
                questionText: q.questionText,
                options: q.options.map((opt, i) => ({ text: opt, isCorrect: i === q.correctAnswer })),
                correctAnswer: q.correctAnswer,
                difficulty: q.difficulty || 'medium'
            }))
        };
    } catch (err) {
        console.error('Battle AI Error:', err);
        // Fallback set
        return {
            topic: topic,
            questions: [
                {
                    questionText: `Challenge Question: Deep dive into ${topic}.`,
                    options: [
                        { text: "Correct Architecture Choice", isCorrect: true },
                        { text: "Scaling Bottleneck", isCorrect: false },
                        { text: "Memory Overhead", isCorrect: false },
                        { text: "Non-standard implementation", isCorrect: false }
                    ],
                    correctAnswer: 0,
                    difficulty: 'medium'
                }
            ]
        };
    }
};

module.exports = { generateBattleQuiz };
