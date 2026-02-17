const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdfParse = require('pdf-parse');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

// List of models to try in order of preference/speed (Updated Feb 2026)
// Using currently available GA and preview models
const MODELS = [
    "gemini-2.0-flash",           // GA - reliable for most tasks
    "gemini-2.5-flash",           // GA - newer, faster
    "gemini-flash-latest",        // Alias - points to latest stable
    "gemini-3-flash-preview"      // Preview - newest features
];

class AIQuestionGenerator {
    constructor() {
        this.genAI = null;
        this.initialized = false;
        this.workingModelName = null; // Cache the working model
    }

    initialize() {
        if (this.initialized) return;

        const apiKey = process.env.GOOGLE_AI_API_KEY;
        if (apiKey) {
            try {
                this.genAI = new GoogleGenerativeAI(apiKey);
                this.initialized = true;
                console.log('✅ AI Generator initialized with Google Gemini');
            } catch (error) {
                console.error('Failed to initialize Gemini:', error.message);
            }
        } else {
            console.warn('⚠️ GOOGLE_AI_API_KEY not configured');
        }
    }

    // Extract text from PDF
    async extractFromPDF(filePath) {
        try {
            const dataBuffer = fs.readFileSync(filePath);
            const pdfData = await pdfParse(dataBuffer);
            console.log('PDF extracted, text length:', pdfData.text.length);
            return pdfData.text;
        } catch (error) {
            console.error('PDF extraction error:', error);
            throw new Error('Failed to extract text from PDF: ' + error.message);
        }
    }

    // Extract data from Excel/CSV
    async extractFromExcel(filePath) {
        try {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = xlsx.utils.sheet_to_json(worksheet);

            let text = '';
            jsonData.forEach((row, index) => {
                text += `Row ${index + 1}: ${JSON.stringify(row)}\n`;
            });

            return text;
        } catch (error) {
            console.error('Excel extraction error:', error);
            throw new Error('Failed to extract data from Excel/CSV: ' + error.message);
        }
    }

    // Convert file to GenerativePart for Gemini
    fileToGenerativePart(path, mimeType) {
        return {
            inlineData: {
                data: fs.readFileSync(path).toString("base64"),
                mimeType
            },
        };
    }

    // New helper to attempt generation with fallback models
    async generateWithFallback(parts, systemInstruction) {
        let lastError = null;

        // If we found a working model before, try it first
        const modelsToTry = this.workingModelName
            ? [this.workingModelName, ...MODELS.filter(m => m !== this.workingModelName)]
            : MODELS;

        for (const modelName of modelsToTry) {
            try {
                console.log(`Trying model: ${modelName}...`);
                const model = this.genAI.getGenerativeModel({ model: modelName });

                // Add system instruction if supported or prepend to parts?
                // SDK typically supports systemInstruction in getGenerativeModel config for 1.5 models
                // But let's stick to prompting in parts for broad compatibility or check docs.
                // Actually, sending system instruction as a "user" and "model" turn is safer, 
                // but 1.5 supports systemInstruction.
                // For simplicity, we keep the prompt in the parts.

                const result = await model.generateContent(parts);
                const response = await result.response;
                const text = response.text();

                console.log(`✅ Success with model: ${modelName}`);
                this.workingModelName = modelName; // Cache it
                return text;

            } catch (error) {
                console.warn(`❌ Failed with ${modelName}: ${error.message.split('\n')[0]}`);
                lastError = error;
                // Continue to next model if it's a 404 or Not Found error
                if (!error.message.includes('not found') && !error.message.includes('404')) {
                    // If it's a content policy error or other specific error, maybe we should stop?
                    // But 1.5 Flash sometimes has stricter filters than Pro, so falling back is good.
                    // We'll continue.
                }
            }
        }

        throw lastError || new Error('All models failed to generate content');
    }

    // Generate questions from Multimodal inputs (Text chunks + Media parts)
    async generateFromMultimodal(parts, options = {}) {
        const {
            count = 10,
            difficulty = 'medium',
            type = 'mcq'
        } = options;

        this.initialize();

        if (!this.genAI) {
            console.warn('⚠️ AI service not available, using fallback generator');
            return this.generateFallbackQuestions(parts, options);
        }

        const typeInstructions = {
            mcq: `Each question must have: "text", "options" (4 choices), "correctAnswer", "explanation".`,
            'fill-blank': `Each question must have: "text" (with ___), "options" ([]), "correctAnswer", "explanation".`,
            qa: `Each question must have: "text", "options" ([]), "correctAnswer", "explanation".`
        };

        const prompt = `You are an expert academic quiz creator. Your task is to generate exactly ${count} high-quality, professional, ${difficulty} difficulty ${type === 'mcq' ? 'multiple choice' : type === 'fill-blank' ? 'fill in the blank' : 'question and answer'} questions based STRICTLY on the provided content.

${typeInstructions[type]}

PROMPT GUIDELINES:
- DO NOT use prefixes like "Based on the content..." or "According to the text...".
- The question text should be direct and professional (e.g., "What is the primary function of...?" instead of "Which term relates to...?").
- Ensure the questions test meaningful knowledge, not just keyword matching.
- For MCQ, distractors must be plausible academic alternatives.

CRITICAL QUALITY GUIDELINES:
1. ACCURACY: All questions must be 100% factually correct based on the content.
2. DISTRACTORS (for MCQ): Wrong options must be plausible and related to the topic, not obviously fake or silly.
3. CLARITY: Questions must be unambiguous and clearly phrased.
4. STANDARD: Use academic standard language. Use only the provided content.

IMPORTANT: Return ONLY a valid JSON array.
Format:
[{"text":"What is the capital of France?","type":"mcq","options":["Paris", "London", "Berlin", "Madrid"],"correctAnswer":"Paris","explanation":"Paris has been the capital of France since..."}]`;

        try {
            console.log('Sending multimodal request to Gemini...');

            // Combine prompt with parts
            const requestParts = [prompt, ...parts];

            // Use fallback logic
            let text = await this.generateWithFallback(requestParts);

            console.log('Response received, length:', text.length);

            // Clean up JSON
            text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const jsonStart = text.indexOf('[');
            const jsonEnd = text.lastIndexOf(']') + 1;
            if (jsonStart !== -1 && jsonEnd > jsonStart) {
                text = text.substring(jsonStart, jsonEnd);
            }

            const questions = JSON.parse(text);
            return questions.map((q, index) => ({
                text: q.text || `Question ${index + 1}`,
                type: q.type || type,
                options: q.options || [],
                correctAnswer: q.correctAnswer || '',
                explanation: q.explanation || '',
                points: this.getPointsForDifficulty(difficulty),
                timeLimit: 0, // No per-question timer
                difficulty,
                order: index
            }));

        } catch (error) {
            console.error('AI generation error:', error);
            console.log('⚠️ AI generation failed, using fallback question generator...');

            // Fallback: Generate questions from content keywords
            return this.generateFallbackQuestions(parts, options);
        }
    }

    // Legacy method wrapper (for compatibility if called directly)
    async generateQuestions(content, options = {}) {
        return this.generateFromMultimodal([content], options);
    }

    // Generate from text wrapper
    async generateFromText(text, options = {}) {
        if (!text || text.trim().length < 50) {
            throw new Error('Text content is too short (minimum 50 characters)');
        }
        return this.generateFromMultimodal([text], options);
    }

    // Generate from transcript wrapper
    async generateFromTranscript(transcript, options = {}) {
        return this.generateFromMultimodal([transcript], options);
    }

    getPointsForDifficulty(difficulty) {
        const map = { easy: 5, medium: 10, hard: 15, advanced: 20 };
        return map[difficulty] || 10;
    }

    getTimeLimitForType(type) {
        return 0; // Disabled per user request
    }

    // Fallback question generator when AI is unavailable
    generateFallbackQuestions(parts, options = {}) {
        const { count = 10, difficulty = 'medium', type = 'mcq' } = options;

        // Extract text content from parts
        let contentText = '';
        for (const part of parts) {
            if (typeof part === 'string') {
                contentText += part + ' ';
            }
        }

        // Extract meaningful sentences from content
        const sentences = contentText
            .split(/[.!?]+/)
            .map(s => s.trim())
            .filter(s => s.length > 30 && s.length < 200);

        // Extract keywords (capitalized words, longer words)
        const words = contentText.split(/\s+/);
        const keywords = words.filter(w =>
            w.length > 5 &&
            /^[A-Z]/.test(w) &&
            !/^(The|This|That|These|Those|When|Where|What|Which|How|Why)$/i.test(w)
        );

        const uniqueKeywords = [...new Set(keywords)].slice(0, 30);

        const questions = [];
        const usedSentences = new Set();

        for (let i = 0; i < count; i++) {
            let question;
            const baseSentence = sentences[i % sentences.length] || `The study of this subject involves understanding key components.`;

            if (type === 'mcq') {
                const sentenceWords = baseSentence.split(/\s+/).filter(w => w.length > 5);
                const keyTerm = sentenceWords[Math.floor(Math.random() * sentenceWords.length)] || 'concept';

                const questionText = baseSentence.replace(keyTerm, '__________');
                const correctAnswer = keyTerm.replace(/[^a-zA-Z0-9\s]/g, '');
                const wrongOptions = uniqueKeywords
                    .filter(k => k.toLowerCase() !== correctAnswer.toLowerCase())
                    .slice(0, 3)
                    .map(k => k.replace(/[^a-zA-Z0-9\s]/g, ''));

                while (wrongOptions.length < 3) {
                    wrongOptions.push(`Related concept ${wrongOptions.length + 1}`);
                }

                const allOptions = [correctAnswer, ...wrongOptions].sort(() => Math.random() - 0.5);

                question = {
                    text: `Identify the missing term: "${questionText}"`,
                    type: 'mcq',
                    options: allOptions,
                    correctAnswer: correctAnswer,
                    explanation: `Refers to ${correctAnswer} in the context provided.`,
                    points: this.getPointsForDifficulty(difficulty),
                    timeLimit: 0,
                    difficulty,
                    order: i
                };
            } else {
                question = {
                    text: `Describe the following concept: ${baseSentence.substring(0, 100)}`,
                    type: 'qa',
                    options: [],
                    correctAnswer: baseSentence,
                    explanation: `Detailed explanation based on content.`,
                    points: this.getPointsForDifficulty(difficulty),
                    timeLimit: 0,
                    difficulty,
                    order: i
                };
            }
            questions.push(question);
        }

        console.log(`✅ Generated ${questions.length} fallback questions`);
        return questions;
    }
}

module.exports = new AIQuestionGenerator();
