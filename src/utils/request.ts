import axios from 'axios';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

// 创建 Axios 实例
const request = axios.create({
    baseURL: '/api',  // 开发环境代理
    timeout: 5000,
});

// 请求拦截器
request.interceptors.request.use(
    (config: AxiosRequestConfig): AxiosRequestConfig => {
        // 确保 headers 存在
        if (!config.headers) {
            config.headers = {};
        }

        const accessToken = localStorage.getItem('accessToken');
        const refreshToken = localStorage.getItem('refreshToken');

        if (accessToken) {
            config.headers['Authorization'] = `Bearer ${accessToken}`;
        }

        if (refreshToken) {
            config.headers['X-Refresh-Token'] = refreshToken;
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// 响应拦截器
request.interceptors.response.use(
    (response: AxiosResponse) => {
        // 直接返回响应
        return response;
    },
    (error) => {
        // TODO: 后端实装 401 处理
        return Promise.reject(error);
    }
);

export default request;