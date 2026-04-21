import request from '../utils/request'
import type { ApiResponse, LoginRequest, LoginResponse, RefreshResponse } from '../types/user'

export function login(data: LoginRequest) {
    return request.post<ApiResponse<LoginResponse>>('/user/login', data)
}

export function logout() {
    return request.delete<ApiResponse<null>>('/user/logout')
}

export function refreshToken() {
    return request.post<ApiResponse<RefreshResponse>>('/user/refresh')
}
