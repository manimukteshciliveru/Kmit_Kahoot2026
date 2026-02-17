const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

const verify = async () => {
    try {
        console.log('Logging in...');
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin@demo.com',
            password: 'adminpassword'
        });
        const token = loginRes.data.data.token;
        console.log('Login successful. Token:', token.substring(0, 10) + '...');

        console.log('Calling getAnalytics...');
        const analyticsRes = await axios.get(`${API_URL}/users/analytics`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Analytics Response Status:', analyticsRes.status);
        console.log('Analytics Data:', JSON.stringify(analyticsRes.data, null, 2));

    } catch (error) {
        if (error.response) {
            console.error('Error Status:', error.response.status);
            console.error('Error Data:', error.response.data);
        } else {
            console.error('Error:', error.message);
        }
    }
};

verify();
