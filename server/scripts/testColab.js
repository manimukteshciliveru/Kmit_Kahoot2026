const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const axios = require('axios');

async function testColab() {
    const url = process.env.COLAB_RAG_URL;
    console.log('--- Loaded Env Vars (Keys only) ---');
    console.log(Object.keys(process.env).filter(k => k.includes('COLAB') || k.includes('AI') || k.includes('URL')));
    console.log('---------------------------------');
    console.log(`🔍 Testing Colab RAG at: ${url}`);

    if (!url) {
        console.error('❌ Error: COLAB_RAG_URL not found in .env');
        return;
    }

    try {
        console.log('📡 Sending test request...');
        const response = await axios.post(`${url}/generate_rag`, {
            content: "The capital of France is Paris. The capital of Germany is Berlin. The capital of Italy is Rome.",
            count: 3,
            difficulty: 'easy',
            type: 'mcq'
        }, { timeout: 120000 });

        console.log('✅ Response received!');
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data.success) {
            console.log('🎉 Self-hosted LLM+RAG is WORKING PERFECTLY!');
        } else {
            console.warn('⚠️ Server responded but failed to generate structured questions.');
            console.log('Raw Response:', response.data.debug || response.data.raw_response);
        }
    } catch (error) {
        console.error('❌ Connection Failed!');
        if (error.code === 'ECONNREFUSED' || error.response?.status === 404) {
            console.error('Possible causes:\n1. Colab session ended\n2. Ngrok URL expired\n3. COLAB_RAG_URL in .env is outdated');
        } else {
            console.error(`Error: ${error.message}`);
        }
    }
}

testColab();
