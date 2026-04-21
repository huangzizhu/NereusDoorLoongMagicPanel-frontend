export interface ApiResponse<T = null> {
    code: number
    msg: string
    data: T
}

export interface LoginRequest {
    account: string
    hashedPassword: string
}

export interface LoginResponse {
    accessToken: string
    refreshToken: string
}

export interface RefreshResponse {
    accessToken: string
    refreshToken: string
}
