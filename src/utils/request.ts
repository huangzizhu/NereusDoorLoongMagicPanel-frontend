import axios from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { resetAuthChecked } from '../router';
import { useNotification } from '../composables/useNotification';

const request = axios.create({
    baseURL: '/api',
    timeout: 5000,
    withCredentials: true,
});

let isRefreshing = false;
let refreshFailCount = 0;
let pendingRequests: Array<{
    resolve: (value: AxiosResponse | Promise<AxiosResponse>) => void;
    reject: (reason?: unknown) => void;
    requestConfig: InternalAxiosRequestConfig & { _retry?: boolean };
}> = [];

function onRefreshed() {
    pendingRequests.forEach(({ resolve, requestConfig }) => {
        resolve(request(requestConfig));
    });
    pendingRequests = [];
}

function onRefreshFailed(error: unknown) {
    pendingRequests.forEach(({ reject }) => {
        reject(error);
    });
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

            if ((code === 40101 || code === 40102) && !originalRequest._retry) {
                originalRequest._retry = true;

                if (isRefreshing) {
                    return new Promise<AxiosResponse>((resolve, reject) => {
                        pendingRequests.push({
                            resolve,
                            reject,
                            requestConfig: originalRequest,
                        });
                    });
                }

                isRefreshing = true;

                try {
                    await axios.post('/api/user/refresh', {}, { withCredentials: true });
                    refreshFailCount = 0;
                    isRefreshing = false;
                    onRefreshed();
                    return request(originalRequest);
                } catch (refreshError) {
                    refreshFailCount += 1;
                    isRefreshing = false;
                    onRefreshFailed(refreshError);

                    if (refreshFailCount >= 3) {
                        const notification = useNotification();
                        notification.warning('登录已过期', '请重新登录');
                        redirectToLogin();
                    }

                    return Promise.reject(refreshError);
                }
            }

            if (code === 40103 || code === 40104) {
                redirectToLogin();
            }
        }

        return Promise.reject(error);
    }
);

export default request;
