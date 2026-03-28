/**
 * ============================================================
 *  aiQuestionService.js
 *  AI-based question generation with dynamic timer estimation.
 *  Uses Google Gemini as primary provider with DB fallback.
 * ============================================================
 */

require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

// ── Gemini Client ─────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(
    process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
);

// Models to try in order (fastest → most capable)
const GEMINI_MODELS = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-pro'
];

// ── In-memory cache (topic:difficulty → question) ─────────────
const questionCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const getCached = (key) => {
    const entry = questionCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        questionCache.delete(key);
        return null;
    }
    return entry.data;
};

const setCache = (key, data) => {
    questionCache.set(key, { data, timestamp: Date.now() });
};

// ── Prompt Builder ────────────────────────────────────────────
/**
 * Builds a structured Gemini prompt for a single MCQ question
 * with adaptive time estimation for average and below-average students.
 */
const buildPrompt = (topic, difficulty) => `
You are an expert educational quiz creator for a competitive quiz platform.

Generate exactly 1 multiple-choice question on the topic: "${topic}"
Difficulty level: "${difficulty}"

STRICT OUTPUT RULES:
1. Return ONLY a valid JSON object. No markdown, no backticks, no extra text.
2. The JSON must have these exact keys:
   - "question": string — the question text
   - "options": array of exactly 4 strings — the answer choices
   - "correctAnswer": string — must be the EXACT TEXT of the correct option (not an index)
   - "explanation": string — one sentence explaining why the answer is correct
   - "difficulty": "${difficulty}"
   - "topic": "${topic}"
   - "timeEstimate": object with keys:
       - "averageStudent": number (seconds an average student needs to solve this)
       - "belowAverageStudent": number (seconds a below-average student needs — always >= averageStudent)

3. For difficulty calibration:
   - easy:    averageStudent ≈ 8–12s,  belowAverageStudent ≈ 12–18s
   - medium:  averageStudent ≈ 15–20s, belowAverageStudent ≈ 22–30s
   - hard:    averageStudent ≈ 22–28s, belowAverageStudent ≈ 30–45s

4. correctAnswer MUST match one of the 4 options exactly.

Example output for a medium Java question:
{
  "question": "What is the output of System.out.println(10 / 3) in Java?",
  "options": ["3.33", "3", "Error", "3.0"],
  "correctAnswer": "3",
  "explanation": "Java performs integer division when both operands are int, truncating the decimal part.",
  "difficulty": "medium",
  "topic": "Java",
  "timeEstimate": {
    "averageStudent": 15,
    "belowAverageStudent": 25
  }
}

Now generate 1 question for topic "${topic}" at "${difficulty}" difficulty. Return ONLY the JSON object.
`.trim();

// ── Timer Decision Logic ──────────────────────────────────────
/**
 * Computes a fair dynamic timer for a question.
 *
 * Strategy:
 *   - Start with averageStudent time
 *   - Add a 5-second buffer for fairness
 *   - Clamp between MIN_TIMER and MAX_TIMER
 *
 * @param {{ averageStudent: number, belowAverageStudent: number }} timeEstimate
 * @returns {number} timer in seconds
 */
const decideTimer = (timeEstimate) => {
    const MIN_TIMER = 8;
    const MAX_TIMER = 60;
    const BUFFER    = 5;

    if (!timeEstimate || typeof timeEstimate.averageStudent !== 'number') {
        // Fallback: default difficulty-agnostic timer
        return 20;
    }

    const base  = timeEstimate.averageStudent + BUFFER;
    const timer = Math.max(MIN_TIMER, Math.min(MAX_TIMER, Math.round(base)));
    return timer;
};

// ── Difficulty-based fallback ────────────────────────────────
const difficultyTimer = (difficulty) => {
    const map = { easy: 10, medium: 20, hard: 30, advanced: 40 };
    return map[difficulty] || 20;
};

// ── JSON Extractor ────────────────────────────────────────────
const extractJSON = (raw) => {
    // Handle markdown code fences
    const stripped = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const first = stripped.indexOf('{');
    const last  = stripped.lastIndexOf('}');
    if (first === -1 || last === -1) throw new Error('No JSON object found in Gemini response');
    return stripped.substring(first, last + 1);
};

// ── Core Generation Function ──────────────────────────────────
/**
 * Generates a single AI MCQ question with time estimate.
 *
 * @param {string} topic      - Question topic (e.g., "Java", "Python", "DBMS")
 * @param {string} difficulty - "easy" | "medium" | "hard" | "advanced"
 * @returns {Promise<{
 *   question: string,
 *   options: string[],
 *   correctAnswer: string,
 *   explanation: string,
 *   difficulty: string,
 *   topic: string,
 *   timeEstimate: { averageStudent: number, belowAverageStudent: number },
 *   timer: number
 * }>}
 */
const generateAIQuestion = async (topic, difficulty = 'medium') => {
    const cacheKey = `${topic}::${difficulty}::${Date.now() % 1000}`; // Soft refresh every second
    const cached = getCached(`${topic}::${difficulty}`);
    // We intentionally don't return cached for survival mode (unique each round)

    const prompt = buildPrompt(topic, difficulty);
    let lastError = null;

    for (const modelName of GEMINI_MODELS) {
        try {
            logger.info(`[AIQuestionService] Trying Gemini model: ${modelName} | Topic: ${topic} | Diff: ${difficulty}`);
            const model  = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const raw    = result.response.text();

            const jsonStr  = extractJSON(raw);
            const parsed   = JSON.parse(jsonStr);

            // Validate required fields
            if (
                !parsed.question ||
                !Array.isArray(parsed.options) ||
                parsed.options.length !== 4 ||
                !parsed.correctAnswer ||
                !parsed.timeEstimate
            ) {
                throw new Error('Incomplete question object from Gemini');
            }

            // Ensure correctAnswer is one of the options (case-insensitive match)
            const match = parsed.options.find(
                opt => opt.trim().toLowerCase() === parsed.correctAnswer.trim().toLowerCase()
            );
            if (!match) {
                // Attempt index-based correction (AI sometimes returns "A", "B", etc.)
                const upper = String(parsed.correctAnswer).toUpperCase().trim();
                const idxMap = { A: 0, B: 1, C: 2, D: 3, '0': 0, '1': 1, '2': 2, '3': 3 };
                if (idxMap[upper] !== undefined && parsed.options[idxMap[upper]]) {
                    parsed.correctAnswer = parsed.options[idxMap[upper]];
                } else {
                    parsed.correctAnswer = parsed.options[0]; // Safe fallback
                    logger.warn(`[AIQuestionService] correctAnswer mismatch fixed for topic: ${topic}`);
                }
            } else {
                parsed.correctAnswer = match; // Normalize to exact option text
            }

            const timer = decideTimer(parsed.timeEstimate);
            const finalQ = {
                question:     parsed.question,
                options:      parsed.options,
                correctAnswer: parsed.correctAnswer,
                explanation:  parsed.explanation || '',
                difficulty,
                topic,
                timeEstimate: parsed.timeEstimate,
                timer
            };

            // Cache for preloading next question
            setCache(`${topic}::${difficulty}`, finalQ);

            logger.info(`[AIQuestionService] ✅ Success via ${modelName} | Timer: ${timer}s`);
            return finalQ;

        } catch (err) {
            logger.warn(`[AIQuestionService] ${modelName} failed: ${err.message}`);
            lastError = err;
        }
    }

    // All Gemini models failed
    logger.error(`[AIQuestionService] ❌ All Gemini models failed for "${topic}". Last error: ${lastError?.message}`);
    return null; // Caller must handle null with DB fallback
};

// ── Preload Helper (for next question while current plays) ────
/**
 * Preloads a question in the background without blocking.
 * Stores in cache so it's ready instantly when needed.
 *
 * @param {string} topic
 * @param {string} difficulty
 */
const preloadNextQuestion = (topic, difficulty) => {
    // Fire and forget — don't await
    generateAIQuestion(topic, difficulty).catch(err => {
        logger.warn(`[AIQuestionService] Preload failed silently: ${err.message}`);
    });
};

module.exports = {
    generateAIQuestion,
    decideTimer,
    difficultyTimer,
    preloadNextQuestion,
};
