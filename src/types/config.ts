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

export interface CredentialRemoteModel {
  id: string
  name: string
  ownedBy: string
  raw: Record<string, unknown>
}

export interface CredentialModelsData {
  credentialId: number
  credentialName: string
  credentialProvider: ApiKeyProvider
  credentialBaseUrl: string
  sourceUrl: string
  models: CredentialRemoteModel[]
}

export interface LlmProfileCreateRequest {
  name: string
  credentialId: number
  model: string
  maxTokens?: number
  contextWindow?: number
  temperature?: number
  retryCount?: number
  retryDelay?: number
  isDefault?: boolean
  isActive?: boolean
  description?: string
}

export interface LlmProfileItem {
  profileId: number
  name: string
  credentialId: number
  credentialName: string
  credentialProvider: ApiKeyProvider
  credentialBaseUrl: string
  model: string
  maxTokens: number
  contextWindow: number
  temperature: number
  retryCount: number
  retryDelay: number
  isDefault: boolean
  isActive: boolean
  description: string
  createTime: string
  updateTime: string
}

export interface LlmProfileBatchCreateRequest {
  credentialId: number
  models: string[]
  namePrefix?: string
  maxTokens?: number
  contextWindow?: number
  temperature?: number
  retryCount?: number
  retryDelay?: number
  isDefaultFirst?: boolean
  isActive?: boolean
  description?: string
}

export interface LlmProfileBatchCreateData {
  total: number
  items: LlmProfileItem[]
}

export interface LlmProfileListData {
  total: number
  items: LlmProfileItem[]
}

export interface LlmProfileUpdateRequest {
  name?: string
  contextWindow?: number
  temperature?: number
  isActive?: boolean
  description?: string
}

export interface LlmProfileTestResult {
  profileId: number
  credentialId: number
  model: string
  available: boolean
  latencyMs: number
  content: string | null
  finishReason: string | null
  usage: Record<string, unknown> | null
  error: string | null
}

export interface ValidationError422 {
  detail: Array<{
    loc: (string | number)[]
    msg: string
    type: string
  }>
}

/* ========== 模型定价 ========== */

export interface ModelPricingItem {
  pricingId: number
  model: string
  inputPrice: number
  cachedInputPrice: number
  outputPrice: number
  multiplier: number
  credentialId: number | null
  isActive: number
  createdAt: string
  updatedAt: string
}

export interface ModelPricingListData {
  total: number
  items: ModelPricingItem[]
}

export interface ModelPricingCreateRequest {
  model: string
  inputPrice?: number
  cachedInputPrice?: number
  outputPrice?: number
  multiplier?: number
  credentialId?: number | null
}

export interface ModelPricingUpdateRequest {
  model?: string
  inputPrice?: number
  cachedInputPrice?: number
  outputPrice?: number
  multiplier?: number
  credentialId?: number | null
  isActive?: number
}
