const OpenAI = require('openai');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function testNewProviders() {
    // 1. Test Groq
    console.log('--- Testing Groq ---');
    if (process.env.GROQ_API_KEY) {
        try {
            const groq = new OpenAI({
                apiKey: process.env.GROQ_API_KEY,
                baseURL: "https://api.groq.com/openai/v1"
            });
            const res = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: "Say 'Groq is Online'" }]
            });
            console.log('✅ Groq:', res.choices[0].message.content);
        } catch (e) {
            console.error('❌ Groq Failed:', e.message);
        }
    } else {
        console.log('❓ Groq Key missing in .env');
    }

    console.log('\n--- Testing DeepSeek ---');
    if (process.env.DEEPSEEK_API_KEY) {
        try {
            const deepseek = new OpenAI({
                apiKey: process.env.DEEPSEEK_API_KEY,
                baseURL: "https://api.deepseek.com"
            });
            const res = await deepseek.chat.completions.create({
                model: "deepseek-chat",
                messages: [{ role: "user", content: "Say 'DeepSeek is Online'" }]
            });
            console.log('✅ DeepSeek:', res.choices[0].message.content);
        } catch (e) {
            console.error('❌ DeepSeek Failed:', e.message);
        }
    } else {
        console.log('❓ DeepSeek Key missing in .env');
    }
}

testNewProviders();
