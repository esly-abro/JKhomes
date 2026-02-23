/**
 * API Client
 * Single axios instance with JWT token management and auto-refresh
 */
/**
 * API Client
 * Single axios instance with JWT token management and auto-refresh
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const api = axios.create({
    baseURL: API_BASE_URL
});

// Track if a token refresh is in progress to prevent multiple simultaneous refreshes
let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

// Helper function to clear auth and redirect - defined BEFORE interceptors
function handleAuthFailure() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    // Only redirect if not already on login page to avoid loops
    if (window.location.pathname !== '/login') {
        window.location.href = '/login';
    }
}

// Request interceptor: attach JWT token
api.interceptors.request.use(config => {
    const token = localStorage.getItem('accessToken');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor: handle 401, auto-refresh token
api.interceptors.response.use(
    response => response,
    async error => {
        const originalRequest = error.config;
        const status = error.response?.status;

        // Global error broadcasting for 403 / 5xx
        if (status === 403 || (status && status >= 500)) {
            window.dispatchEvent(new CustomEvent('api-error', {
                detail: { status, message: error.response?.data?.message }
            }));
        }

        if (status === 401 && !originalRequest._retry) {
            if (isRefreshing) {
                // If already refreshing, queue this request
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(token => {
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    return api(originalRequest);
                }).catch(err => {
                    return Promise.reject(err);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            const refreshToken = localStorage.getItem('refreshToken');
            if (!refreshToken) {
                handleAuthFailure();
                return Promise.reject(error);
            }

            try {
                const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
                    refreshToken
                });
                const newAccessToken = data.accessToken;
                localStorage.setItem('accessToken', newAccessToken);
                
                // Update all queued requests with new token
                processQueue(null, newAccessToken);
                
                // Retry original request with new token
                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                return api(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError, null);
                handleAuthFailure();
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }
        return Promise.reject(error);
    }
);

export default api;
export { api };
