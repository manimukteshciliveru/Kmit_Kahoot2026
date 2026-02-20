import axios from 'axios';

// Determine API URL based on environment
const getApiUrl = () => {
    // First, try to use the environment variable
    if (import.meta.env.VITE_API_URL) {
        return import.meta.env.VITE_API_URL;
    }

    // In production, use the current origin
    if (import.meta.env.PROD) {
        const protocol = window.location.protocol;
        const host = window.location.host;
        return `${protocol}//${host}/api`;
    }

    // Fallback for development
    return 'http://localhost:5000/api/v1';
};

const API_URL = getApiUrl();

console.log('📡 [API] Using API URL:', API_URL);
console.log('📡 [API] Environment:', import.meta.env.MODE);
console.log('📡 [API] Current Origin:', window.location.origin);

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Request interceptor to add auth token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

// Auth API
const LOGIN_REQUESTS = new Map();

export const authAPI = {
    register: (data) => api.post('/auth/register', data),
    login: (data) => {
        // Idempotency Key: Use email/username + timestamp(minute resolution) or just duplicate check
        const key = JSON.stringify(data);
        if (LOGIN_REQUESTS.has(key)) {
            return LOGIN_REQUESTS.get(key);
        }

        const request = api.post('/auth/login', data).finally(() => {
            setTimeout(() => LOGIN_REQUESTS.delete(key), 500); // Clear after 500ms
        });

        LOGIN_REQUESTS.set(key, request);
        return request;
    },
    getMe: () => api.get('/auth/me'),
    updateProfile: (data) => api.put('/auth/profile', data),
    changePassword: (data) => api.put('/auth/password', data)
};

// Quiz API
export const quizAPI = {
    create: (data) => api.post('/quizzes', data),
    getAll: (params) => api.get('/quizzes', { params }),
    getById: (id) => api.get(`/quizzes/${id}`),
    update: (id, data) => api.put(`/quizzes/${id}`, data),
    delete: (id) => api.delete(`/quizzes/${id}`),
    join: (code) => api.post(`/quizzes/join/${code}`),
    start: (id) => api.post(`/quizzes/${id}/start`),
    end: (id) => api.post(`/quizzes/${id}/end`),
    reset: (id) => api.post(`/quizzes/${id}/reset`),
    getLeaderboard: (id) => api.get(`/quizzes/${id}/leaderboard`),
    getResults: (id) => api.get(`/quizzes/${id}/results`),
    downloadReport: (id) => api.get(`/quizzes/${id}/report`, { responseType: 'blob' })
};

// Response API
export const responseAPI = {
    submitAnswer: (data) => api.post('/responses/answer', data),
    getMyResponse: (quizId) => api.get(`/responses/quiz/${quizId}`),
    getById: (id) => api.get(`/responses/${id}`),
    getAllResponses: (quizId) => api.get(`/responses/quiz/${quizId}/all`),
    reportTabSwitch: (data) => api.post('/responses/tab-switch', data),
    completeQuiz: (data) => api.post('/responses/complete', data),
    getHistory: (params) => api.get('/responses/history', { params })
};

// AI API
export const aiAPI = {
    generateFromFile: (formData) => api.post('/ai/generate-from-file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    generateFromText: (data) => api.post('/ai/generate-from-text', data),
    generateFromTranscript: (data) => api.post('/ai/generate-from-transcript', data),
    explainQuestion: (data) => api.post('/ai/explain', data)
};

// User/Admin API
export const userAPI = {
    getAll: (params) => api.get('/users', { params }),
    getById: (id) => api.get(`/users/${id}`),
    create: (data) => api.post('/users', data),
    update: (id, data) => api.put(`/users/${id}`, data),
    delete: (id) => api.delete(`/users/${id}`),
    toggleStatus: (id) => api.put(`/users/${id}/status`),
    getAnalytics: () => api.get('/users/analytics'),
    bulkCreate: (formData) => api.post('/users/bulk', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    searchStudents: (branches) => api.post('/users/search-students', { branches })
};

// Admin System API
export const adminAPI = {
    getHealth: () => api.get('/admin/health'),
    getBackup: () => api.get('/admin/backup', { responseType: 'blob' }),
    restoreBackup: (formData) => api.post('/admin/restore', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })
};

export default api;
