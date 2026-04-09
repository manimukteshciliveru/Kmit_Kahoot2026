const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Mistral } = require('@mistralai/mistralai');
const pdfParse = require('pdf-parse');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const officeparser = require('officeparser');
const OpenAI = require('openai');
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
        this.openai = null;
        this.groq = null;
        this.deepseek = null;
        this.openrouter = null;
        this.huggingface_key = null;
        this.ollama_url = "http://localhost:11434"; // Default Ollama port
        this.initialized = false;
        this.workingModelName = null;
    }

    initialize() {
        if (this.initialized) return;

        // Initialize Gemini
        const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
        if (geminiKey) {
            try {
                this.gemini = new GoogleGenerativeAI(geminiKey);
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

        // Initialize OpenAI
        if (process.env.OPENAI_API_KEY) {
            try {
                this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
                logger.info('✅ AI Service: OpenAI initialized');
            } catch (error) {
                logger.error('❌ AI Service: Failed to initialize OpenAI', error);
            }
        }

        // Initialize Groq (OpenAI Compatible)
        if (process.env.GROQ_API_KEY) {
            try {
                this.groq = new OpenAI({
                    apiKey: process.env.GROQ_API_KEY,
                    baseURL: "https://api.groq.com/openai/v1"
                });
                logger.info('✅ AI Service: Groq initialized');
            } catch (error) {
                logger.error('❌ AI Service: Failed to initialize Groq', error);
            }
        }

        // Initialize DeepSeek (OpenAI Compatible)
        if (process.env.DEEPSEEK_API_KEY) {
            try {
                this.deepseek = new OpenAI({
                    apiKey: process.env.DEEPSEEK_API_KEY,
                    baseURL: "https://api.deepseek.com"
                });
                logger.info('✅ AI Service: DeepSeek initialized');
            } catch (error) {
                logger.error('❌ AI Service: Failed to initialize DeepSeek', error);
            }
        }

        // Initialize OpenRouter (OpenAI Compatible - Great for Free Models)
        if (process.env.OPENROUTER_API_KEY) {
            try {
                this.openrouter = new OpenAI({
                    baseURL: "https://openrouter.ai/api/v1",
                    apiKey: process.env.OPENROUTER_API_KEY,
                    defaultHeaders: {
                        "HTTP-Referer": "http://localhost:5000",
                        "X-Title": "Kahoot Clone",
                    }
                });
                logger.info('✅ AI Service: OpenRouter initialized');
            } catch (error) {
                logger.error('❌ AI Service: Failed to initialize OpenRouter', error);
            }
        }

        // HuggingFace Key
        if (process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY) {
            this.huggingface_key = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;
            logger.info('✅ AI Service: HuggingFace initialized');
        }

        // Ollama doesn't need a key, but we check the URL if provided
        if (process.env.OLLAMA_URL) {
            this.ollama_url = process.env.OLLAMA_URL;
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

    async extractFromWord(filePathOrUrl) {
        try {
            const dataBuffer = await this.getFileBuffer(filePathOrUrl);
            const result = await mammoth.extractRawText({ buffer: dataBuffer });
            return result.value;
        } catch (error) {
            logger.error('Word extraction error:', error);
            throw new Error(`Word Error: ${error.message}`);
        }
    }

    async extractFromPowerPoint(filePathOrUrl) {
        try {
            // officeparser works well with buffers or file paths
            // If it's a URL, we must use the buffer
            const dataBuffer = await this.getFileBuffer(filePathOrUrl);
            return new Promise((resolve, reject) => {
                officeparser.parseOffice(dataBuffer, (data, err) => {
                    if (err) return reject(err);
                    resolve(data);
                });
            });
        } catch (error) {
            logger.error('PowerPoint extraction error:', error);
            throw new Error(`PowerPoint Error: ${error.message}`);
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
            const isExtraction = options.mode === 'extract';
            const promptSystem = isExtraction 
                ? `
                You are a data extraction specialist. Your task is to extract EVERY quiz question present in the provided content.
                Format: [{"text":"Question text here","options":["Option 1","Option 2","Option 3","Option 4"],"correctAnswer":"Option 1","explanation":"Explanation here"}]
                
                STRICT RULES:
                1. DO NOT CREATE NEW QUESTIONS. Only extract what exists.
                2. Capture options exactly as written.
                3. Identify the correct answer based on context or "Answer:" indicators.
                4. Return ONLY valid JSON array.
                `
                : `
                You are an expert academic quiz creator. Generate exactly ${count} ${difficulty} level questions based on the provided content.
                Question Type: ${type.toUpperCase()}
                
                STRICT FORMATTING RULES:
                1. Return ONLY valid JSON array. No markdown, no 'json' code blocks.
                2. Format: [{"text":"Question text here","options":["Option 1","Option 2","Option 3","Option 4"],"correctAnswer":"Option 1","explanation":"Explanation here"}]
                3. For MCQ/MSQ: Provide 4 distinct options. 'correctAnswer' MUST be the exact text of the correct option.
                4. For FILL-BLANK/QA: 'options' should be empty []. 'correctAnswer' should be the concise correct answer.
                5. CRITICAL: The 'correctAnswer' field MUST be the exact string text. Do NOT use "A", "B", "1", "2" or indices.
                6. Accuracy: 100% based on content.
                
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

            // Attempt 2: Groq (Extreme Speed Fallback)
            if (!responseText && this.groq) {
                logger.info('AI Service: Falling back to Groq (Speed Mode)...');
                const textContent = parts.map(p => typeof p === 'string' ? p : '[Media Content Omitted]').join('\n');
                try {
                    const response = await this.groq.chat.completions.create({
                        model: "llama-3.3-70b-versatile",
                        messages: [{ role: "user", content: promptSystem + '\n' + textContent }],
                        temperature: 0.7
                    });
                    responseText = response.choices[0].message.content;
                    providerUsed = 'groq';
                    modelUsed = 'llama-3.3-70b-versatile';
                    logger.info('✅ AI Service: Success with Groq');
                } catch (groqError) {
                    logger.error('❌ AI Service: Groq Failed', groqError);
                }
            }

            // Attempt 3: OpenAI (High Fidelity Fallback)
            if (!responseText && this.openai) {
                logger.info('AI Service: Falling back to OpenAI...');
                const textContent = parts.map(p => typeof p === 'string' ? p : '[Media Content Omitted]').join('\n');
                try {
                    const response = await this.openai.chat.completions.create({
                        model: "gpt-4o",
                        messages: [
                            { role: "system", content: "You are a professional quiz generator focused on high-quality technical content." },
                            { role: "user", content: promptSystem + '\n' + textContent }
                        ],
                        response_format: { type: "json_object" }
                    });
                    const content = JSON.parse(response.choices[0].message.content);
                    responseText = JSON.stringify(content.questions || content);
                    providerUsed = 'openai';
                    modelUsed = 'gpt-4o';
                    logger.info('✅ AI Service: Success with OpenAI');
                } catch (openaiError) {
                    logger.error('❌ AI Service: OpenAI Failed', openaiError);
                }
            }

            // Attempt 4: Mistral AI (Budget Fallback)
            if (!responseText && this.mistral) {
                logger.info('AI Service: Falling back to Mistral...');
                const textContent = parts.map(p => typeof p === 'string' ? p : '[Media Content Omitted]').join('\n');
                try {
                    const chatResponse = await this.mistral.chat.complete({
                        model: MISTRAL_MODEL,
                        messages: [{ role: 'user', content: promptSystem + '\n' + textContent }],
                    });
                    if (chatResponse?.choices?.[0]?.message) {
                        responseText = chatResponse.choices[0].message.content;
                        providerUsed = 'mistral';
                        modelUsed = MISTRAL_MODEL;
                        logger.info('✅ AI Service: Success with Mistral');
                    }
                } catch (mistralError) {
                    logger.error('❌ AI Service: Mistral Failed', mistralError);
                }
            }

            // Attempt 5: DeepSeek (Technical Accuracy Fallback)
            if (!responseText && this.deepseek) {
                logger.info('AI Service: Falling back to DeepSeek...');
                const textContent = parts.map(p => typeof p === 'string' ? p : '[Media Content Omitted]').join('\n');
                try {
                    const response = await this.deepseek.chat.completions.create({
                        model: "deepseek-chat",
                        messages: [{ role: "user", content: promptSystem + '\n' + textContent }]
                    });
                    responseText = response.choices[0].message.content;
                    providerUsed = 'deepseek';
                    modelUsed = 'deepseek-chat';
                    logger.info('✅ AI Service: Success with DeepSeek');
                } catch (dsError) {
                    logger.error('❌ AI Service: DeepSeek Failed', dsError);
                }
            }

            // Attempt 6: OpenRouter (Unlimited Free Models Fallback)
            if (!responseText && this.openrouter) {
                logger.info('AI Service: Falling back to OpenRouter (Free Tier)...');
                const textContent = parts.map(p => typeof p === 'string' ? p : '[Media Content Omitted]').join('\n');
                try {
                    const response = await this.openrouter.chat.completions.create({
                        model: "google/gemma-2-9b-it:free", // One of the best free models
                        messages: [{ role: "user", content: promptSystem + '\n' + textContent }]
                    });
                    responseText = response.choices[0].message.content;
                    providerUsed = 'openrouter';
                    modelUsed = 'gemma-2-9b-it:free';
                    logger.info('✅ AI Service: Success with OpenRouter');
                } catch (orError) {
                    logger.error('❌ AI Service: OpenRouter Failed', orError);
                }
            }

            // Attempt 7: Ollama (Local AI - 100% Free Forever)
            if (!responseText) {
                logger.info('AI Service: Attempting Local Ollama Fallback...');
                const textContent = parts.map(p => typeof p === 'string' ? p : '[Media Content Omitted]').join('\n');
                try {
                    const localResult = await this.generateFromOllama(textContent, promptSystem);
                    if (localResult) {
                        responseText = localResult;
                        providerUsed = 'ollama';
                        modelUsed = 'llama3'; // Assumed default
                        logger.info('✅ AI Service: Success with Local Ollama');
                    }
                } catch (ollamaError) {
                    logger.debug('Ollama not running locally. Skipping.');
                }
            }

            // Attempt 8: HuggingFace (Open-Source Fallback)
            if (!responseText && this.huggingface_key) {
                logger.info('AI Service: Falling back to HuggingFace...');
                const textContent = parts.map(p => typeof p === 'string' ? p : '[Media Content Omitted]').join('\n');
                try {
                    const hfResult = await this.generateFromHuggingFace(textContent, promptSystem);
                    if (hfResult) {
                        responseText = hfResult;
                        providerUsed = 'huggingface';
                        modelUsed = 'mistral-7b-v0.3';
                        logger.info('✅ AI Service: Success with HuggingFace');
                    }
                } catch (hfError) {
                    logger.error('❌ AI Service: HuggingFace Failed', hfError);
                }
            }

            // Attempt 9: Colab RAG Fallback (Last Resort BEFORE dummy fallback)
            if (!responseText && process.env.COLAB_RAG_URL) {
                logger.info('AI Service: Falling back to Google Colab RAG Engine...');
                const textContent = parts.map(p => typeof p === 'string' ? p : '[Media Content Omitted]').join('\n');
                try {
                    const colabResult = await this.generateFromColab(textContent, options);
                    
                    // Robust check: accept if it's an array OR has a questions property
                    const questionsFound = Array.isArray(colabResult) ? colabResult : (colabResult?.questions || null);
                    
                    if (questionsFound && questionsFound.length > 0) {
                        responseText = JSON.stringify(questionsFound);
                        providerUsed = 'colab';
                        modelUsed = 'llama-3-rag';
                        logger.info('✅ AI Service: Success with Colab RAG');
                    }
                } catch (colabError) {
                    logger.error('❌ AI Service: Colab RAG Failed', colabError);
                }
            }

            // Final fallback
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

            const providerEnum = ['google', 'mistral', 'openai', 'colab', 'groq', 'deepseek', 'openrouter', 'ollama', 'huggingface', 'fallback'];
            const safeProvider = providerEnum.includes(provider) ? provider : 'fallback';

            await AILog.create({
                userId,
                provider: safeProvider,
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

    async generateFlashcards(topic, subject, count = 10, userId) {
        this.initialize();

        const promptSystem = `
        You are an educational assistant. Generate exactly ${count} UNIQUE flashcard question-answer pairs for the topic: ${topic}.
        
        STRICT FORMATTING RULES:
        1. Return ONLY a valid JSON array of objects. No markdown, no 'json' code blocks.
        2. Format: [{"question":"Concise question here","answer":"Clear and short answer here"}]
        3. VARIETY: Ensure every flashcard covers a DIFFERENT sub-concept or aspect to avoid repetition.
        4. Accuracy: High academic standards.
        `;

        const requestParts = [promptSystem];
        let responseText = '';
        let providerUsed = '';
        let modelUsed = '';

        try {
            // Attempt 1: Gemini
            if (this.gemini) {
                try {
                    const model = this.gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
                    const result = await model.generateContent(requestParts);
                    const response = await result.response;
                    responseText = response.text();
                    providerUsed = 'google';
                    modelUsed = 'gemini-2.0-flash';
                } catch (e) {
                    logger.warn('Gemini Flashcard generation failed:', e.message);
                }
            }

            // Attempt 2: OpenAI
            if (!responseText && this.openai) {
                try {
                    const response = await this.openai.chat.completions.create({
                        model: "gpt-4o",
                        messages: [{ role: "user", content: promptSystem }],
                        response_format: { type: "json_object" }
                    });
                    const content = JSON.parse(response.choices[0].message.content);
                    responseText = JSON.stringify(content.flashcards || content);
                    providerUsed = 'openai';
                    modelUsed = 'gpt-4o';
                } catch (e) {
                    logger.warn('OpenAI Flashcard generation failed:', e.message);
                }
            }

            // Attempt 3: Mistral
            if (!responseText && this.mistral) {
                try {
                    logger.info('AI Service: Falling back to Mistral for flashcards...');
                    const chatResponse = await this.mistral.chat.complete({
                        model: MISTRAL_MODEL,
                        messages: [{ role: 'user', content: promptSystem }],
                    });
                    if (chatResponse?.choices?.[0]?.message) {
                        responseText = chatResponse.choices[0].message.content;
                        providerUsed = 'mistral';
                        modelUsed = MISTRAL_MODEL;
                        logger.info('✅ AI Service: Success with Mistral');
                    }
                } catch (e) {
                    logger.warn('Mistral Flashcard generation failed:', e.message);
                }
            }

            if (!responseText) throw new Error('AI providers failed to generate flashcards.');

            const cleanJson = this.sanitizeJson(responseText);
            const jsonMatch = cleanJson.match(/\[.*\]/s);
            const toParse = jsonMatch ? jsonMatch[0] : cleanJson;
            const flashcards = JSON.parse(toParse);

            const finalFlashcards = Array.isArray(flashcards.flashcards) ? flashcards.flashcards : flashcards;

            this.logUsage(userId, providerUsed, modelUsed, promptSystem.length, responseText.length, 'success');
            return finalFlashcards;

        } catch (error) {
            logger.error('Flashcard Generation Error:', error);
            // Enhanced fallback - actually try to provide some topic-specific questions even in fallback
            const fallbackCount = Math.min(count, 5);
            return [
                { question: `What is the core definition of ${topic}?`, answer: `Definition: ${topic} is a significant concept in ${subject || 'this field'}. [AI capacity reached]` },
                { question: `How is ${topic} typically applied?`, answer: `Applications vary based on use cases within ${subject || 'the curriculum'}. [AI temporary fallback]` },
                { question: `Summarize the main advantage of ${topic}.`, answer: `It provides specialized functionality for ${subject || 'targeted tasks'}. [AI temporary fallback]` },
                { question: `Identify one key limitation of ${topic}.`, answer: `Complexity and resource requirements are common constraints. [AI temporary fallback]` },
                { question: `Where can I find more technical info on ${topic}?`, answer: `Refer to official documentation and academic resources for ${subject}. [Service over capacity]` }
            ].slice(0, fallbackCount);
        }
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

    /**
     * Dedicated LLaMA + RAG Method
     * Use this when you want to specifically target the self-hosted RAG engine
     */
    async generateViaRAG(documentContent, query, options = {}, userId) {
        this.initialize();
        const url = process.env.COLAB_RAG_URL;
        
        if (!url) {
            logger.warn('RAG Error: COLAB_RAG_URL not set. Falling back to standard AI.');
            return this.generateFromText(documentContent, options, userId);
        }

        try {
            logger.info('🚀 High-Priority: Using LLaMA + RAG Engine (Colab)...');
            const response = await axios.post(`${url}/generate_rag`, {
                content: documentContent,
                query: query,
                count: options.count || 10,
                difficulty: options.difficulty || 'medium'
            }, { timeout: 180000 }); // Longer timeout for RAG operations

            if (response.data && response.data.success) {
                this.logUsage(userId, 'colab', 'llama-3-rag', documentContent.length, JSON.stringify(response.data).length, 'success');
                return response.data.questions;
            }
            throw new Error('Colab RAG returned unsuccessful status');
        } catch (error) {
            logger.error('❌ LLaMA + RAG Failed:', error.message);
            // Fallback to standard cross-provider generation logic
            return this.generateFromText(documentContent, options, userId);
        }
    }

    async generateFromOllama(content, systemPrompt) {
        try {
            const response = await axios.post(`${this.ollama_url}/api/chat`, {
                model: "llama3",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: content }
                ],
                stream: false,
                format: "json"
            }, { timeout: 60000 });

            let output = response.data.message.content;
            if (typeof output === 'object') output = JSON.stringify(output);
            return output;
        } catch (error) {
            return null;
        }
    }

    async generateFromHuggingFace(content, systemPrompt) {
        try {
            const model = "mistralai/Mistral-7B-Instruct-v0.3";
            const response = await axios.post(
                `https://api-inference.huggingface.co/models/${model}`,
                { 
                    inputs: `<s>[INST] ${systemPrompt}\n\nCONTENT:\n${content} [/INST]`,
                    parameters: { max_new_tokens: 1000, return_full_text: false }
                },
                { headers: { Authorization: `Bearer ${this.huggingface_key}` }, timeout: 30000 }
            );

            return response.data[0].generated_text;
        } catch (error) {
            throw error;
        }
    }

    async generateFromColab(content, options) {
        const url = process.env.COLAB_RAG_URL;
        if (!url) return null;

        try {
            const response = await axios.post(`${url}/generate`, {
                content,
                count: options.count || 10,
                difficulty: options.difficulty || 'medium',
                type: options.type || 'mcq'
            }, { timeout: 120000 }); // Longer timeout for Colab generation

            return response.data;
        } catch (error) {
            logger.error('Colab generation error:', error);
            return null;
        }
    }
}

module.exports = new AIQuestionGenerator();
