export type ApiKeyProvider = 'OpenAI' | 'Azure' | 'Anthropic' | 'Custom'

export interface ApiKeyCreateRequest {
  name: string
  provider: ApiKeyProvider
  baseUrl?: string
  isActive: boolean
  description?: string
  quotaLimit?: number
  apiKey: string
}

export interface ApiKeyUpdateRequest {
  name: string
  provider: ApiKeyProvider
  baseUrl?: string | null
  isActive: boolean
  description?: string | null
  quotaLimit?: number | null
  credentialId: number
}

export interface ApiKeyItem {
  name: string
  provider: ApiKeyProvider
  baseUrl: string
  isActive: boolean
  description: string
  quotaLimit: number
  credentialId: number
  maskedKey: string
  usedQuota: number
  expireAt: string | null
  lastUsedAt: string | null
  createTime: string
  updateTime: string
}

export interface ApiKeyListData {
  total: number
  items: ApiKeyItem[]
}

export interface ApiResponse<T = null> {
  code: number
  msg: string
  data: T
}

export interface ValidationError422 {
  detail: Array<{
    loc: (string | number)[]
    msg: string
    type: string
  }>
}
