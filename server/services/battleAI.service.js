require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ── API Clients ──────────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(
    process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY
);

let mistral = null;
if (process.env.MISTRAL_API_KEY) {
    const { Mistral } = require("@mistralai/mistralai");
    mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
}

let openai = null;
if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'undefined') {
    const { OpenAI } = require("openai");
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ── In-memory question cache (topic:count → questions[]) ─────────────────────
const questionCache = new Map();
const CACHE_TTL_MS  = 24 * 60 * 60 * 1000; // 24 hours

const getCached = (key) => {
    const entry = questionCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        questionCache.delete(key);
        return null;
    }
    return entry.questions;
};

const setCache = (key, questions) => {
    questionCache.set(key, { questions, timestamp: Date.now() });
};

// ── Master prompt builder ─────────────────────────────────────────────────────
const buildPrompt = (topic, count) => `
You are a senior competitive programming instructor creating exam questions for a 1v1 coding quiz battle.

Generate exactly ${count} multiple choice questions on the topic: "${topic}".

Question style requirements:
- Questions must be practical and specific — no vague theory questions
- Include code snippets in questions wherever relevant (wrap in backticks)
- Model your questions after LeetCode, GeeksforGeeks, W3Schools, and CodeChef problem styles
- Cover: time complexity, output prediction, error spotting, concept application, tricky edge cases
- Difficulty: 60% medium, 40% hard — no easy questions
- Options must be plausible — wrong answers should be common mistakes, not obviously wrong
- Each question must have exactly one correct answer

Output format: Return ONLY a valid JSON array. No markdown, no backticks, no explanation, no extra text.

Each object must have exactly these keys:
- "questionText": string (may contain inline code using backticks)
- "options": array of exactly 4 strings
- "correctAnswer": integer 0–3 (index of correct option in options array)
- "difficulty": "medium" or "hard"
- "explanation": string (one sentence explaining why the answer is correct)

Example of ONE good question object:
{
  "questionText": "What is the output of this Python code?\\n\`\`\`\\nx = [1, 2, 3]\\nprint(x[-1] * 2)\\n\`\`\`",
  "options": ["3", "6", "[3, 3]", "Error"],
  "correctAnswer": 1,
  "difficulty": "medium",
  "explanation": "x[-1] accesses the last element (3), and 3 * 2 = 6."
}

Now generate exactly ${count} questions about "${topic}". Return only the JSON array.
`.trim();

// ── JSON extractor (handles Gemini/Mistral markdown leakage) ─────────────────
const extractJSON = (raw) => {
    const first = raw.indexOf('[');
    const last  = raw.lastIndexOf(']');
    if (first === -1 || last === -1) throw new Error('No JSON array found in response');
    return raw.substring(first, last + 1);
};

// ── Question mapper ───────────────────────────────────────────────────────────
const mapQuestions = (parsed, count) => {
    return parsed.slice(0, count).map(q => {
        if (!q.questionText || !Array.isArray(q.options) || q.options.length !== 4) {
            throw new Error('Malformed question object from AI response');
        }
        return {
            questionText:  q.questionText,
            options:       q.options.map((opt, i) => ({
                text:      opt.toString(),
                isCorrect: i === Number(q.correctAnswer)
            })),
            correctAnswer: Number(q.correctAnswer),
            difficulty:    q.difficulty || 'medium',
            explanation:   q.explanation || ''
        };
    });
};

// Gemini models to try in order
const GEMINI_MODELS = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-pro'
];

// ── API callers (each returns raw text or throws) ─────────────────────────────
const callGemini = async (prompt) => {
    let lastError = null;

    for (const modelName of GEMINI_MODELS) {
        try {
            console.log(`[BattleAI] Attempting Gemini model: ${modelName}`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (err) {
            console.warn(`[BattleAI] Gemini model ${modelName} failed: ${err.message}`);
            lastError = err;
            // Continue to next model
        }
    }

    throw lastError || new Error('All Gemini models failed');
};

const callMistral = async (prompt) => {
    if (!mistral) throw new Error('Mistral not configured');
    const result = await mistral.chat.complete({
        model:    'mistral-medium-latest',
        messages: [{ role: 'user', content: prompt }]
    });
    return result.choices[0].message.content;
};

const callOpenAI = async (prompt) => {
    if (!openai) throw new Error('OpenAI not configured');
    const result = await openai.chat.completions.create({
        model:       'gpt-3.5-turbo',
        messages:    [{ role: 'user', content: prompt }],
        temperature: 0.7
    });
    return result.choices[0].message.content;
};

// ── Main export ───────────────────────────────────────────────────────────────
const generateBattleQuiz = async (topic, count = 5) => {
    const cacheKey = `${topic}::${count}`;
    const cached   = getCached(cacheKey);
    if (cached) {
        console.log(`[BattleAI] Cache hit for "${topic}" (${count}q)`);
        // Shuffle cached set so same questions appear in different order each battle
        const shuffled = [...cached].sort(() => Math.random() - 0.5).slice(0, count);
        return { topic, questions: shuffled };
    }

    const prompt  = buildPrompt(topic, count);
    const callers = [
        { name: 'Gemini',  fn: callGemini  },
        { name: 'Mistral', fn: callMistral },
        { name: 'OpenAI',  fn: callOpenAI  }
    ];

    let lastError = null;

    for (const { name, fn } of callers) {
        try {
            console.log(`[BattleAI] Trying ${name} for "${topic}"...`);
            const raw       = await fn(prompt);
            const jsonStr   = extractJSON(raw);
            const parsed    = JSON.parse(jsonStr);
            const questions = mapQuestions(parsed, count);

            if (questions.length < count) {
                throw new Error(`${name} returned only ${questions.length}/${count} valid questions`);
            }

            // Cache a larger pool (2x count) if API returned more, for variety
            const poolToCache = mapQuestions(parsed, Math.min(parsed.length, count * 2));
            setCache(cacheKey, poolToCache);

            console.log(`[BattleAI] ${name} succeeded — ${questions.length} questions for "${topic}"`);
            return { topic, questions };

        } catch (err) {
            console.error(`[BattleAI] ${name} failed:`, err.message);
            lastError = err;
        }
    }

    // All APIs failed — do NOT serve fake questions, surface the error clearly
    throw new Error(
        `All AI providers failed to generate questions for topic "${topic}". ` +
        `Last error: ${lastError?.message}. Check API keys and rate limits.`
    );
};

module.exports = { generateBattleQuiz };
