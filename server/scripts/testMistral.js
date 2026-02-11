const { Mistral } = require('@mistralai/mistralai');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function testMistral() {
    console.log('Testing Mistral API...');
    console.log('API Key:', process.env.MISTRAL_API_KEY ? 'Found' : 'NOT FOUND');

    try {
        const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

        const response = await client.chat.complete({
            model: 'mistral-small-latest',
            messages: [{ role: 'user', content: 'Generate 1 simple multiple choice question about the sun. Return only JSON: {"text":"...","options":["A","B","C","D"],"correctAnswer":"..."}' }],
            temperature: 0.7,
            maxTokens: 500
        });

        console.log('✅ Response received!');
        console.log('Content:', response.choices[0].message.content.substring(0, 300));
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testMistral();
