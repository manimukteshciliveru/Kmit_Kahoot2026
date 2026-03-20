const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY);

const generateBattleQuiz = async (topic, count = 5) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Using faster model
        
        const prompt = `Generate exactly ${count} highly competitive multiple choice questions about "${topic}".
        Rules:
        1. Mix of medium and hard difficulty.
        2. Format strictly as a valid JSON array only. No markdown formatting, no backticks, no comments.
        3. Each object should have exactly: "questionText" (string), "options" (array of exactly 4 strings), "correctAnswer" (integer 0-3), "difficulty" (string "medium" or "hard").
        
        Ensure the question is clear and the options distinct.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();
        
        // Sanitize for JSON parsing safely
        text = text.replace(/```json/gi, "").replace(/```/g, "").trim();
        const questions = JSON.parse(text);

        // Ensure we only return the requested amount
        const slicedQuestions = questions.slice(0, count);

        return {
            topic: topic,
            questions: slicedQuestions.map(q => ({
                questionText: q.questionText,
                options: q.options.map((opt, i) => ({ text: opt, isCorrect: i === q.correctAnswer })),
                correctAnswer: q.correctAnswer,
                difficulty: q.difficulty || 'medium'
            }))
        };
    } catch (err) {
        console.error('Battle AI Error/Fallback triggered:', err.message);
        // Robust Fallback set adapted to count
        const fallbackQuestions = Array.from({ length: count }, (_, i) => ({
            questionText: `Challenge Question ${i + 1}: Deep dive into ${topic}.`,
            options: [
                { text: "Correct Answer", isCorrect: true }, 
                { text: "Wrong Option 1", isCorrect: false }, 
                { text: "Wrong Option 2", isCorrect: false }, 
                { text: "Wrong Option 3", isCorrect: false }
            ].sort(() => Math.random() - 0.5), // Shuffle options
            correctAnswer: 0, // This gets re-evaluated based on shuffle in a theoretical real scenario, but for fallback we'll just set it to the correct index post-shuffle:
            difficulty: i % 2 === 0 ? 'medium' : 'hard'
        })).map(q => {
             // ensure correctAnswer index aligns with the shufffled options
             q.correctAnswer = q.options.findIndex(o => o.isCorrect);
             return q;
        });

        return {
            topic: topic,
            questions: fallbackQuestions
        };
    }
};

module.exports = { generateBattleQuiz };
