const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const apiKey = process.env.GOOGLE_AI_API_KEY;
if (!apiKey) {
    console.error('No API Key found in .env');
    process.exit(1);
}

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

console.log('Fetching models from:', url.replace(apiKey, 'HIDDEN'));

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.models) {
                console.log('\n=== Available Models ===');
                json.models.forEach(m => {
                    const methods = m.supportedGenerationMethods ? m.supportedGenerationMethods.join(', ') : 'unknown';
                    console.log(`- Name: ${m.name}`);
                    console.log(`  Methods: ${methods}`);
                });
            } else {
                console.log('\n❌ No models field in response. Full response:');
                console.log(JSON.stringify(json, null, 2));
            }
        } catch (e) {
            console.error('Error parsing JSON:', e.message);
            console.log('Raw data:', data);
        }
    });
}).on('error', (e) => {
    console.error('Request error:', e.message);
});
