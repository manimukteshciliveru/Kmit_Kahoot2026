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
    return 'http://localhost:5000/api';
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

// Token refresh state to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

// Response interceptor to handle auth errors with automatic token refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // If error is 401 and we haven't tried to refresh yet
        if (error.response?.status === 401 && !originalRequest._retry) {
            if (isRefreshing) {
                // If already refreshing, queue this request
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                })
                    .then(token => {
                        originalRequest.headers.Authorization = `Bearer ${token}`;
                        return api(originalRequest);
                    })
                    .catch(err => {
                        return Promise.reject(err);
                    });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            // Try to refresh token using stored refresh token
            const refreshToken = localStorage.getItem('refreshToken');

            if (refreshToken) {
                try {
                    // Call refresh endpoint - send refreshToken in body
                    const refreshResponse = await axios.post(
                        `${API_URL}/auth/refresh`,
                        { refreshToken },
                        { headers: { 'Content-Type': 'application/json' } }
                    );

                    const { token: newToken, user } = refreshResponse.data.data || refreshResponse.data;

                    if (newToken) {
                        localStorage.setItem('token', newToken);
                        if (user) {
                            localStorage.setItem('user', JSON.stringify(user));
                        }

                        // Update the original request with new token
                        originalRequest.headers.Authorization = `Bearer ${newToken}`;

                        // Process queued requests
                        processQueue(null, newToken);
                        isRefreshing = false;

                        // Retry the original request
                        return api(originalRequest);
                    }
                } catch (refreshError) {
                    // Refresh failed, logout user
                    processQueue(refreshError, null);
                    isRefreshing = false;

                    localStorage.removeItem('token');
                    localStorage.removeItem('refreshToken');
                    localStorage.removeItem('user');

                    if (window.location.pathname !== '/login') {
                        window.location.href = '/login';
                    }
                    return Promise.reject(refreshError);
                }
            } else {
                // No refresh token, logout
                isRefreshing = false;
                localStorage.removeItem('token');
                localStorage.removeItem('refreshToken');
                localStorage.removeItem('user');

                if (window.location.pathname !== '/login') {
                    window.location.href = '/login';
                }
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
    refreshToken: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
    getMe: () => api.get('/auth/me'),
    updateProfile: (data) => api.put('/auth/profile', data),
    changePassword: (data) => api.put('/auth/password', data)
};

// Quiz API
export const quizAPI = {
    create: (data) => api.post('/quiz', data),
    getAll: (params) => api.get('/quiz', { params }),
    getById: (id) => api.get(`/quiz/${id}`),
    update: (id, data) => api.put(`/quiz/${id}`, data),
    delete: (id) => api.delete(`/quiz/${id}`),
    join: (code) => api.post(`/quiz/join/${code}`),
    start: (id) => api.post(`/quiz/${id}/start`),
    end: (id) => api.post(`/quiz/${id}/end`),
    rehost: (id) => api.post(`/quiz/${id}/rehost`),
    getLeaderboard: (id) => api.get(`/quiz/${id}/leaderboard`),
    getResults: (id) => api.get(`/quiz/${id}/results`),
    getAnalytics: (id) => api.get(`/quiz/${id}/analytics`),
    getAttendance: (id) => api.get(`/quiz/${id}/attendance`),
    downloadReport: (id) => api.get(`/quiz/${id}/report`, { responseType: 'blob' })
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
    explainQuestion: (data) => api.post('/ai/explain', data),
    getReview: (quizId) => api.get(`/ai/review/${quizId}`)
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
