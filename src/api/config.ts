import request from '../utils/request'
import type {
  ApiResponse,
  ApiKeyCreateRequest,
  ApiKeyUpdateRequest,
  ApiKeyItem,
  ApiKeyListData,
  CredentialModelsData,
  LlmProfileCreateRequest,
  LlmProfileItem,
  LlmProfileBatchCreateRequest,
  LlmProfileBatchCreateData,
  LlmProfileListData,
  LlmProfileUpdateRequest,
  LlmProfileTestResult,
  ModelPricingCreateRequest,
  ModelPricingUpdateRequest,
  ModelPricingListData,
  ModelPricingItem,
} from '../types/config'

export function getApiKeyList() {
  return request.get<ApiResponse<ApiKeyListData>>('/config/apikey')
}

export function createApiKey(data: ApiKeyCreateRequest) {
  return request.post<ApiResponse<ApiKeyItem>>('/config/apikey', data)
}

export function updateApiKey(data: ApiKeyUpdateRequest) {
  return request.put<ApiResponse<ApiKeyItem>>('/config/apikey', data)
}

export function deleteApiKey(credentialId: number) {
  return request.delete<ApiResponse<null>>(`/config/apikey/${credentialId}`)
}

export function getCredentialModels(credentialId: number) {
  return request.get<ApiResponse<CredentialModelsData>>(`/agent/llm/credentials/${credentialId}/models`)
}

export function createLlmProfile(data: LlmProfileCreateRequest) {
  return request.post<ApiResponse<LlmProfileItem>>('/agent/llm/profiles', data)
}

export function batchCreateLlmProfiles(data: LlmProfileBatchCreateRequest) {
  return request.post<ApiResponse<LlmProfileBatchCreateData>>('/agent/llm/profiles/batch', data)
}

export function getLlmProfiles() {
  return request.get<ApiResponse<LlmProfileListData>>('/agent/llm/profiles')
}

export function updateLlmProfile(profileId: number, data: LlmProfileUpdateRequest) {
  return request.put<ApiResponse<LlmProfileItem>>(`/agent/llm/profiles/${profileId}`, data)
}

export function deleteLlmProfile(profileId: number) {
  return request.delete<ApiResponse<null>>(`/agent/llm/profiles/${profileId}`)
}

export function setDefaultLlmProfile(profileId: number) {
  return request.put<ApiResponse<LlmProfileItem>>(`/agent/llm/profiles/${profileId}/default`)
}

export function testLlmProfile(profileId: number) {
  return request.post<ApiResponse<LlmProfileTestResult>>(`/agent/llm/profiles/${profileId}/test`)
}

/* ========== 模型定价 ========== */

export function getModelPricingList(params?: { model?: string; credentialId?: number; isActive?: number }) {
  return request.get<ApiResponse<ModelPricingListData>>('/agent/model-pricing', { params })
}

export function createModelPricing(data: ModelPricingCreateRequest) {
  return request.post<ApiResponse<ModelPricingItem>>('/agent/model-pricing', data)
}

export function updateModelPricing(pricingId: number, data: ModelPricingUpdateRequest) {
  return request.put<ApiResponse<ModelPricingItem>>(`/agent/model-pricing/${pricingId}`, data)
}

export function deleteModelPricing(pricingId: number) {
  return request.delete<ApiResponse<null>>(`/agent/model-pricing/${pricingId}`)
}
