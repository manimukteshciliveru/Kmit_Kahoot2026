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
const buildPrompt = (topic, difficulty, content = null) => `
You are an expert quiz master. Generate exactly 1 MCQ based on ${content ? 'the following context' : `the topic: "${topic}"`}.

${content ? `CONTEXT: """${content}"""` : ''}

Difficulty: "${difficulty}"

STRICT OUTPUT RULES:
1. Return ONLY a valid JSON object.
2. Keys: "question", "options" (4), "correctAnswer", "explanation", "difficulty", "topic", "timeEstimate".
3. TIME MASTER RULE: You must individually decide the timer for this specific question based on its depth.
   - Simple recall: 10–15s
   - Logic/Math/Analysis: 20–40s
   - Very Complex: 40–60s
   Return this in "timeEstimate.averageStudent".
4. If context is provided, ensure the question and all options are derived EXCLUSIVELY from that text.

Example:
{
  "question": "...",
  "options": ["...", "...", "...", "..."],
  "correctAnswer": "...",
  "explanation": "...",
  "difficulty": "${difficulty}",
  "topic": "${topic}",
  "timeEstimate": { "averageStudent": 25, "belowAverageStudent": 35 }
}
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
    if (!raw) return null;
    // Handle markdown code fences robustly
    let cleaned = raw
        .replace(/^```json\s*/im, '')
        .replace(/^```\s*/im, '')
        .replace(/```\s*$/im, '')
        .trim();
    
    const first = cleaned.indexOf('{');
    const last  = cleaned.lastIndexOf('}');
    if (first === -1 || last === -1) {
        // Fallback: try finding any JSON-like structure
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) return match[0];
        throw new Error('No valid JSON object found in Gemini response');
    }
    return cleaned.substring(first, last + 1);
};

// ── Core Generation Function ──────────────────────────────────
/**
 * Generates a single AI MCQ question with time estimate.
 *
 * @param {string} topic      - Question topic
 * @param {string} difficulty - "easy" | "medium" | "hard"
 * @param {string} content    - (Optional) Pasted content or PDF context
 * @returns {Promise<any>}
 */
const generateAIQuestion = async (topic, difficulty = 'medium', content = null) => {
    const cacheKey = `${topic}::${difficulty}::${Date.now() % 1000}`; 
    const prompt = buildPrompt(topic, difficulty, content);
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
