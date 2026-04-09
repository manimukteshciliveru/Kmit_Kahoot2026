const OpenAI = require('openai');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function testOpenAI() {
    console.log('Testing OpenAI API...');
    const apiKey = process.env.OPENAI_API_KEY;
    console.log('API Key:', apiKey ? 'Found (starts with ' + apiKey.substring(0, 10) + '...)' : 'NOT FOUND');

    if (!apiKey) return;

    try {
        const openai = new OpenAI({ apiKey });
        
        console.log('Sending request to OpenAI (gpt-3.5-turbo)...');
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "You are a helpful assistant." },
                { role: "user", content: "Say 'OpenAI is working' if you see this." }
            ],
            max_tokens: 20
        });

        console.log('✅ Response received!');
        console.log('Content:', response.choices[0].message.content.trim());
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.status === 401) {
            console.log('\nUnauthorized: The API key might be invalid.');
        } else if (error.status === 429) {
            console.log('\nRate Limit / Quota: You might have run out of credits.');
        }
    }
}

testOpenAI();
