const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function listModels() {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
        console.error('GOOGLE_AI_API_KEY not found in .env');
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        // We can't list models directly with SDK comfortably without admin API sometimes, 
        // but let's try to just generate content with a known stable model to test connectivity
        // or iterate through common model names.

        // Actually, the error message suggested "Call ListModels". 
        // In clean HTTP API it's GET /v1beta/models.
        // In SDK, it might be available.

        console.log('Testing specific database of models...');

        const candidates = [
            'gemini-1.5-flash',
            'gemini-1.5-flash-latest',
            'gemini-1.5-flash-001',
            'gemini-1.5-pro',
            'gemini-pro',
            'gemini-1.0-pro'
        ];

        for (const modelName of candidates) {
            console.log(`\nTesting ${modelName}...`);
            try {
                const m = genAI.getGenerativeModel({ model: modelName });
                const result = await m.generateContent("Hello");
                console.log(`✅ ${modelName} WORKED!`);
                console.log('Response:', result.response.text());
                // If one works, we should probably switch to it.
                break;
            } catch (e) {
                console.log(`❌ ${modelName} failed: ${e.message.split('\n')[0]}`);
            }
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

listModels();
