require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { OpenAI } = require("openai");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || "dummy");

const formatQuestionsArray = (topic, parsedQuestions, targetCount) => {
    let questions = mapOptions(parsedQuestions).slice(0, targetCount);
    // Force pad array to EXACT targetCount if AI failed to generate enough
    if (questions.length < targetCount) {
        const remaining = targetCount - questions.length;
        const fallbacks = createFallback(topic, remaining, questions.length);
        questions = [...questions, ...fallbacks];
    }
    return { topic, questions };
};

const generateBattleQuiz = async (topic, count = 5) => {
    const prompt = `Generate exactly ${count} highly competitive multiple choice questions about "${topic}".
    Rules:
    1. Mix of medium and hard difficulty.
    2. Format strictly as a valid JSON array only. No markdown formatting, no backticks, no comments.
    3. Each object should have exactly: "questionText" (string), "options" (array of exactly 4 strings), "correctAnswer" (integer 0-3), "difficulty" (string "medium" or "hard").
    Ensure the question is clear and the options distinct.`;

    try {
        // Primary Attempt: Gemini 1.5 Flash (Generous Free Tier)
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent(prompt);
            let text = result.response.text().replace(/```json/gi, "").replace(/```/g, "").trim();
            
            // Fix parsing if AI adds rogue markdown
            const firstBracket = text.indexOf('[');
            const lastBracket = text.lastIndexOf(']');
            if (firstBracket !== -1 && lastBracket !== -1) {
                text = text.substring(firstBracket, lastBracket + 1);
            }

            return formatQuestionsArray(topic, JSON.parse(text), count);
        } catch (geminiError) {
            console.error('Gemini Failed:', geminiError.message);
            // Secondary Attempt: OpenAI
            if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'undefined') {
                const completion = await openai.chat.completions.create({
                    model: "gpt-3.5-turbo",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.7,
                });
                let text = completion.choices[0].message.content.replace(/```json/gi, "").replace(/```/g, "").trim();
                
                const firstBracket = text.indexOf('[');
                const lastBracket = text.lastIndexOf(']');
                if (firstBracket !== -1 && lastBracket !== -1) {
                    text = text.substring(firstBracket, lastBracket + 1);
                }

                return formatQuestionsArray(topic, JSON.parse(text), count);
            }
            throw new Error("Both APIs failed or not configured");
        }
    } catch (err) {
        console.error('Battle AI Error/Fallback triggered:', err.message);
        return { topic, questions: createFallback(topic, count, 0) };
    }
};

const mapOptions = (questions) => questions.map(q => ({
    questionText: q.questionText,
    options: q.options.map((opt, i) => ({ text: opt.toString(), isCorrect: i === Number(q.correctAnswer) })),
    correctAnswer: Number(q.correctAnswer),
    difficulty: q.difficulty || 'medium'
}));

const createFallback = (topic, count, startIndex = 0) => Array.from({ length: count }, (_, i) => {
    const opts = [
        { text: "Correct Data Structure", isCorrect: true }, 
        { text: "Wrong Interface", isCorrect: false }, 
        { text: "Memory Leak", isCorrect: false }, 
        { text: "Syntax Error", isCorrect: false }
    ].sort(() => Math.random() - 0.5);
    return {
        questionText: `Challenge Question ${startIndex + i + 1}: Core concept implementation of ${topic}.`,
        options: opts,
        correctAnswer: opts.findIndex(o => o.isCorrect),
        difficulty: (startIndex + i) % 2 === 0 ? 'medium' : 'hard'
    };
});

module.exports = { generateBattleQuiz };
