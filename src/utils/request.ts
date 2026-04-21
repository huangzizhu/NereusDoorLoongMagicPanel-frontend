import axios from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { resetAuthChecked } from '../router';

const request = axios.create({
    baseURL: '/api',
    timeout: 5000,
    withCredentials: true,
});

let isRefreshing = false;
let pendingRequests: Array<() => void> = [];

function onRefreshed() {
    pendingRequests.forEach((cb) => cb());
    pendingRequests = [];
}

function redirectToLogin() {
    pendingRequests = [];
    resetAuthChecked();
    window.location.href = '/login';
}

request.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

request.interceptors.response.use(
    (response: AxiosResponse) => {
        return response;
    },
    async (error) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        if (error.response?.status === 401) {
            const code = error.response.data?.code;

            if (code === 40102 && !originalRequest._retry) {
                originalRequest._retry = true;

                if (isRefreshing) {
                    return new Promise((resolve) => {
                        pendingRequests.push(() => {
                            resolve(request(originalRequest));
                        });
                    });
                }

                isRefreshing = true;

                try {
                    await axios.post('/api/user/refresh', {}, { withCredentials: true });
                    isRefreshing = false;
                    onRefreshed();
                    return request(originalRequest);
                } catch (refreshError) {
                    isRefreshing = false;
                    redirectToLogin();
                    return Promise.reject(refreshError);
                }
            }

            if (code === 40101 || code === 40103 || code === 40104) {
                redirectToLogin();
            }
        }

        return Promise.reject(error);
    }
);

export default request;
