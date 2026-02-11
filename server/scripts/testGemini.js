const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function testGemini() {
    console.log('Testing Gemini API...');
    console.log('API Key:', process.env.GOOGLE_AI_API_KEY ? 'Found (starts with ' + process.env.GOOGLE_AI_API_KEY.substring(0, 10) + '...)' : 'NOT FOUND');

    try {
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = 'Generate 2 simple multiple choice questions about the solar system. Return as a JSON array with properties: text, options (array of 4), correctAnswer. Only return valid JSON, no markdown.';

        console.log('Sending request to Gemini...');
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        console.log('Response received!');
        console.log('Raw response:', text.substring(0, 500));

        // Try to parse
        const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const questions = JSON.parse(cleanText);
        console.log('\n✅ Success! Generated', questions.length, 'questions');
        console.log('First question:', questions[0].text);
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.message.includes('API_KEY')) {
            console.log('\nThe API key might be invalid. Please check it.');
        }
    }
}

testGemini();
