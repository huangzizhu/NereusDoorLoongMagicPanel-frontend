import request from '../utils/request'
import type { ApiResponse, ApiKeyCreateRequest, ApiKeyUpdateRequest, ApiKeyItem, ApiKeyListData } from '../types/config'

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

export function checkApiKey(credentialId: number) {
  return request.get<ApiResponse<null>>('/config/apikey/check', {
    params: { credentialId }
  })
}
