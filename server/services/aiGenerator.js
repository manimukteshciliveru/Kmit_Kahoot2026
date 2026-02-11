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

        const prompt = `You are an expert quiz creator. Generate exactly ${count} ${difficulty} difficulty ${type === 'mcq' ? 'multiple choice' : type === 'fill-blank' ? 'fill in the blank' : 'question and answer'} questions based on the provided content (text, audio, video, or documents).

${typeInstructions[type]}

IMPORTANT: Return ONLY a valid JSON array. No markdown, no explanation.
Format:
[{"text":"...","type":"${type}","options":[...],"correctAnswer":"...","explanation":"..."}]`;

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
                timeLimit: this.getTimeLimitForType(type),
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
        const map = { mcq: 20, 'fill-blank': 30, qa: 60 };
        return map[type] || 30;
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

            if (type === 'mcq') {
                // Find a sentence to create a question from
                let baseSentence = sentences[i % sentences.length] || `This is a question about the topic`;

                // Avoid reusing the exact same sentence
                let attempts = 0;
                while (usedSentences.has(baseSentence) && attempts < sentences.length) {
                    baseSentence = sentences[(i + attempts) % sentences.length] || baseSentence;
                    attempts++;
                }
                usedSentences.add(baseSentence);

                // Extract a key term to ask about
                const sentenceWords = baseSentence.split(/\s+/).filter(w => w.length > 4);
                const keyTerm = sentenceWords[Math.floor(Math.random() * sentenceWords.length)] || 'concept';

                // Generate options
                const correctAnswer = keyTerm.replace(/[^a-zA-Z0-9\s]/g, '');
                const wrongOptions = uniqueKeywords
                    .filter(k => k.toLowerCase() !== correctAnswer.toLowerCase())
                    .slice(0, 3)
                    .map(k => k.replace(/[^a-zA-Z0-9\s]/g, ''));

                // Ensure we have 4 options
                while (wrongOptions.length < 3) {
                    wrongOptions.push(`Option ${wrongOptions.length + 1}`);
                }

                const allOptions = [correctAnswer, ...wrongOptions].sort(() => Math.random() - 0.5);

                question = {
                    text: `Based on the content, which term best relates to: "${baseSentence.substring(0, 80)}..."?`,
                    type: 'mcq',
                    options: allOptions,
                    correctAnswer: correctAnswer,
                    explanation: `This question is based on the provided content about ${keyTerm}.`,
                    points: this.getPointsForDifficulty(difficulty),
                    timeLimit: this.getTimeLimitForType(type),
                    difficulty,
                    order: i
                };
            } else if (type === 'fill-blank') {
                const baseSentence = sentences[i % sentences.length] || 'The main topic is about learning';
                const words = baseSentence.split(/\s+/);
                const blankIndex = Math.floor(words.length / 2);
                const answer = words[blankIndex] || 'answer';
                words[blankIndex] = '___';

                question = {
                    text: words.join(' '),
                    type: 'fill-blank',
                    options: [],
                    correctAnswer: answer.replace(/[^a-zA-Z0-9\s]/g, ''),
                    explanation: `The correct answer completes the sentence from the content.`,
                    points: this.getPointsForDifficulty(difficulty),
                    timeLimit: this.getTimeLimitForType(type),
                    difficulty,
                    order: i
                };
            } else {
                // Q&A type
                const baseSentence = sentences[i % sentences.length] || 'Explain the main concept';
                question = {
                    text: `Explain the following: ${baseSentence.substring(0, 100)}`,
                    type: 'qa',
                    options: [],
                    correctAnswer: baseSentence,
                    explanation: `Answer should be based on the provided content.`,
                    points: this.getPointsForDifficulty(difficulty),
                    timeLimit: this.getTimeLimitForType(type),
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
