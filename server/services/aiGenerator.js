const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Mistral } = require('@mistralai/mistralai');
const pdfParse = require('pdf-parse');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const AILog = require('../models/AILog');
const logger = require('../utils/logger'); // Use our new logger

// Configuration
const GEMINI_MODELS = [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-pro"
];
const MISTRAL_MODEL = "mistral-small-latest";

class AIQuestionGenerator {
    constructor() {
        this.gemini = null;
        this.mistral = null;
        this.initialized = false;
        this.workingModelName = null;
    }

    initialize() {
        if (this.initialized) return;

        // Initialize Gemini
        if (process.env.GOOGLE_AI_API_KEY) {
            try {
                this.gemini = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
                logger.info('✅ AI Service: Google Gemini initialized');
            } catch (error) {
                logger.error('❌ AI Service: Failed to initialize Gemini', error);
            }
        }

        // Initialize Mistral
        if (process.env.MISTRAL_API_KEY) {
            try {
                this.mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
                logger.info('✅ AI Service: Mistral AI initialized');
            } catch (error) {
                logger.error('❌ AI Service: Failed to initialize Mistral', error);
            }
        }

        this.initialized = true;
    }

    // --- File Extraction Helpers ---

    async getFileBuffer(filePathOrUrl) {
        if (filePathOrUrl.startsWith('http')) {
            const response = await axios.get(filePathOrUrl, { responseType: 'arraybuffer' });
            return Buffer.from(response.data);
        } else {
            return fs.readFileSync(filePathOrUrl);
        }
    }

    async extractFromPDF(filePathOrUrl) {
        try {
            const dataBuffer = await this.getFileBuffer(filePathOrUrl);
            const pdfData = await pdfParse(dataBuffer);
            return pdfData.text;
        } catch (error) {
            logger.error('PDF extraction error:', error);
            throw new Error(`PDF Error: ${error.message}`);
        }
    }

    async extractFromExcel(filePathOrUrl) {
        try {
            const dataBuffer = await this.getFileBuffer(filePathOrUrl);
            const workbook = xlsx.read(dataBuffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = xlsx.utils.sheet_to_json(worksheet);
            return JSON.stringify(jsonData, null, 2);
        } catch (error) {
            logger.error('Excel extraction error:', error);
            throw new Error(`Excel Error: ${error.message}`);
        }
    }

    async fileToGenerativePart(filePathOrUrl, mimeType) {
        const dataBuffer = await this.getFileBuffer(filePathOrUrl);
        return {
            inlineData: {
                data: dataBuffer.toString("base64"),
                mimeType
            },
        };
    }

    // --- Core Generation Logic ---

    async generateFromMultimodal(parts, options = {}, userId) {
        this.initialize();
        const { count = 10, difficulty = 'medium', type = 'mcq' } = options;

        // 1. Construct the System Prompt
        const promptSystem = `
        You are an expert academic quiz creator. Generate exactly ${count} ${difficulty} ${type === 'mcq' ? 'multiple choice' : 'Q&A'} questions.
        
        STRICT FORMATTING RULES:
        1. Return ONLY valid JSON array. No markdown, no 'json' code blocks.
        2. Format: [{"text":"Question text here","options":["Option 1","Option 2","Option 3","Option 4"],"correctAnswer":"Option 1","explanation":"Explanation here"}]
        3. CRITICAL: The 'correctAnswer' field MUST be the exact string text of the correct option. Do NOT use "A", "B", "1", "2" or indices.
        4. Accuracy: 100% based on content.
        
        CONTENT:
        `;

        const requestParts = [promptSystem, ...parts];
        let responseText = '';
        let providerUsed = '';
        let modelUsed = '';

        try {
            // Attempt 1: Google Gemini (Primary)
            if (this.gemini) {
                try {
                    logger.info('AI Service: Attempting generation with Gemini...');
                    for (const modelName of GEMINI_MODELS) {
                        try {
                            const model = this.gemini.getGenerativeModel({ model: modelName });
                            const result = await model.generateContent(requestParts);
                            const response = await result.response;
                            responseText = response.text();

                            if (responseText) {
                                providerUsed = 'google';
                                modelUsed = modelName;
                                logger.info(`✅ AI Service: Success with ${modelName}`);
                                break;
                            }
                        } catch (e) {
                            const errMsg = e.message || '';
                            logger.warn(`⚠️ Gemini ${modelName} failed: ${errMsg}`);
                            if (errMsg.includes('leaked') || errMsg.includes('API key')) {
                                logger.error('❌ AI Service: Gemini API Key is invalid or leaked. Skipping Gemini.');
                                this.gemini = null; // Disable for this session
                                break;
                            }
                        }
                    }
                } catch (geminiError) {
                    logger.error('❌ AI Service: Gemini Suite Failed', geminiError);
                }
            }

            // Attempt 2: Mistral AI (Fallback)
            if (!responseText && this.mistral) {
                logger.info('AI Service: Falling back to Mistral...');
                // Convert parts to string for Mistral (it doesn't handle multimodal arrays the same way)
                // For this implementation, we assume text-only parts for Mistral fallback if possible
                const textContent = parts.map(p => typeof p === 'string' ? p : '[Media Content Omitted]').join('\n');

                try {
                    const chatResponse = await this.mistral.chat.complete({
                        model: MISTRAL_MODEL,
                        messages: [{ role: 'user', content: promptSystem + '\n' + textContent }],
                    });

                    if (chatResponse && chatResponse.choices && chatResponse.choices[0] && chatResponse.choices[0].message) {
                        responseText = chatResponse.choices[0].message.content;
                        providerUsed = 'mistral';
                        modelUsed = MISTRAL_MODEL;
                        logger.info('✅ AI Service: Success with Mistral');
                    }
                } catch (mistralError) {
                    logger.error('❌ AI Service: Mistral Failed', mistralError);
                }
            }

            // Attempt 3: Local Fallback (Last Resort)
            if (!responseText) {
                throw new Error('All AI providers failed.');
            }

            // 2. Parse JSON
            const cleanJson = this.sanitizeJson(responseText);
            let questions = [];

            try {
                // Remove Markdown code blocks if sanitizeJson didn't catch them all
                const jsonMatch = cleanJson.match(/\[.*\]/s);
                const toParse = jsonMatch ? jsonMatch[0] : cleanJson;
                questions = JSON.parse(toParse);
            } catch (parseError) {
                logger.error('JSON Parse Error:', parseError);
                logger.debug('Raw Response:', responseText);
                throw new Error('Failed to parse AI response');
            }

            // 3. Log Usage (Async - don't block response)
            this.logUsage(userId, providerUsed, modelUsed, JSON.stringify(requestParts).length, responseText.length, 'success');

            // 4. Format Output
            return questions.map((q, index) => {
                // Fix correct answer if it is an index letter or number
                let finalCorrectAnswer = q.correctAnswer;
                if (q.options && Array.isArray(q.options) && q.options.length > 0) {
                    const upper = String(q.correctAnswer).toUpperCase().trim();
                    if (['A', 'B', 'C', 'D', 'E'].includes(upper)) {
                        const map = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4 };
                        if (q.options[map[upper]]) {
                            finalCorrectAnswer = q.options[map[upper]];
                        }
                    }
                    // Or if it's 0, 1, 2, 3
                    else if (/^\d$/.test(finalCorrectAnswer)) {
                        const idx = parseInt(finalCorrectAnswer);
                        if (q.options[idx]) finalCorrectAnswer = q.options[idx];
                    }
                    // Or if it's "Option 1", "Option A"
                    else if (upper.startsWith('OPTION ')) {
                        const lastChar = upper.split(' ').pop();
                        if (['A', 'B', 'C', 'D', 'E', '1', '2', '3', '4'].includes(lastChar)) {
                            // Recursive fix call logic effectively
                            const map = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, '1': 0, '2': 1, '3': 2, '4': 3 };
                            if (q.options[map[lastChar]]) {
                                finalCorrectAnswer = q.options[map[lastChar]];
                            }
                        }
                    }
                }

                return {
                    text: q.text || `Question ${index + 1}`,
                    type: q.type || type,
                    options: q.options || [],
                    correctAnswer: finalCorrectAnswer || '',
                    explanation: q.explanation || '',
                    points: this.getPoints(difficulty),
                    timeLimit: 0,
                    difficulty,
                    order: index
                };
            });

        } catch (error) {
            logger.error('AI Service: Fatal Generation Error', error);
            this.logUsage(userId, 'fallback', 'local', 0, 0, 'failed', error.message);

            // Return dummy fallback questions so the user gets *something*
            return this.generateFallbackQuestions(parts, options);
        }
    }

    // --- Utilities ---

    sanitizeJson(text) {
        return text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }

    getPoints(difficulty) {
        const map = { easy: 5, medium: 10, hard: 15, advanced: 20 };
        return map[difficulty] || 10;
    }

    async logUsage(userId, provider, model, promptLength, responseTextLength, status, errorMsg = '') {
        try {
            // Estimate Token Count (粗略 4 chars = 1 token)
            const estimatedTokens = Math.ceil((promptLength + responseTextLength) / 4);

            // Estimate Cost (Very rough approximation based on Flash pricing)
            // $0.35 / 1M input tokens, $0.70 / 1M output tokens
            const cost = (estimatedTokens / 1000000) * 0.5;

            await AILog.create({
                userId,
                provider,
                model,
                action: 'generate_quiz',
                promptLength,
                responseLength: responseTextLength,
                tokensUsed: estimatedTokens,
                cost: cost,
                status,
                errorMessage: errorMsg
            });
        } catch (logError) {
            logger.error('AI Logging Failed:', logError);
        }
    }

    generateFallbackQuestions(parts, options) {
        // (Simple fallback logic reused from previous implementation)
        const { count = 5 } = options;
        return Array.from({ length: count }, (_, i) => ({
            text: `Generated Question ${i + 1} (AI Service Unavailable)`,
            type: options.type || 'mcq',
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            correctAnswer: 'Option A',
            explanation: 'This is a placeholder due to AI service unavailability.',
            points: 10,
            timeLimit: 0,
            difficulty: options.difficulty || 'medium'
        }));
    }

    async generateExplanation(question, userAnswer, correctAnswer, userId) {
        this.initialize();

        const promptSystem = `
        You are an expert tutor. A student answered a quiz question.
        
        Question: "${question}"
        Student Answer: "${userAnswer}"
        Correct Answer: "${correctAnswer}"
        
        Provide a concise explanation (max 3 sentences) clarifying why the correct answer is right and (if applicable) why the student's answer is incorrect.
        If the student skipped, explain the correct answer.
        Tone: Encouraging, educational, and clear.
        Format: Return ONLY the explanation text.
        `;

        const requestParts = [promptSystem];
        let responseText = '';
        let providerUsed = '';
        let modelUsed = '';

        try {
            // Attempt 1: Gemini
            if (this.gemini) {
                try {
                    const model = this.gemini.getGenerativeModel({ model: "gemini-1.5-flash" });
                    const result = await model.generateContent(requestParts);
                    const response = await result.response;
                    responseText = response.text();
                    if (responseText) {
                        providerUsed = 'google';
                        modelUsed = 'gemini-1.5-flash';
                    }
                } catch (e) {
                    logger.warn('Gemini Explanation Failed:', e.message);
                }
            }

            // Attempt 2: Mistral
            if (!responseText && this.mistral) {
                try {
                    const chatResponse = await this.mistral.chat.complete({
                        model: MISTRAL_MODEL,
                        messages: [{ role: 'user', content: promptSystem }],
                    });
                    if (chatResponse?.choices?.[0]?.message) {
                        responseText = chatResponse.choices[0].message.content;
                        providerUsed = 'mistral';
                        modelUsed = MISTRAL_MODEL;
                    }
                } catch (e) {
                    logger.warn('Mistral Explanation Failed:', e.message);
                }
            }

            if (!responseText) throw new Error('AI providers failed to explain.');

            // Log usage (minimal cost)
            this.logUsage(userId, providerUsed, modelUsed, promptSystem.length, responseText.length, 'success');

            return responseText.trim();

        } catch (error) {
            logger.error('Explanation Error:', error);
            return "Unable to generate explanation at this time. Please refer to course materials.";
        }
    }

    async generateFromText(text, options, userId) {
        return this.generateFromMultimodal([text], options, userId);
    }

    async generateFromTranscript(transcript, options, userId) {
        return this.generateFromMultimodal([transcript], options, userId);
    }
}

module.exports = new AIQuestionGenerator();
